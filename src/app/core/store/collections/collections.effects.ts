/*
 * Lumeer: Modern Data Definition and Processing Platform
 *
 * Copyright (C) since 2017 Lumeer.io, s.r.o. and/or its affiliates.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import {HttpErrorResponse} from '@angular/common/http';
import {Injectable} from '@angular/core';

import {Actions, Effect, ofType} from '@ngrx/effects';
import {Action, select, Store} from '@ngrx/store';
import {I18n} from '@ngx-translate/i18n-polyfill';
import {Angulartics2} from 'angulartics2';
import {EMPTY, from, Observable, of} from 'rxjs';
import {catchError, filter, map, mergeMap, take, tap, withLatestFrom} from 'rxjs/operators';
import {environment} from '../../../../environments/environment';
import {CollectionDto} from '../../dto';
import {ImportService} from '../../rest';
import {AppState} from '../app.state';
import {CommonAction} from '../common/common.action';
import {DocumentModel} from '../documents/document.model';
import {DocumentsAction, DocumentsActionType} from '../documents/documents.action';
import {selectNavigation} from '../navigation/navigation.state';
import {NotificationsAction} from '../notifications/notifications.action';
import {selectOrganizationByWorkspace} from '../organizations/organizations.state';
import {PermissionType} from '../permissions/permissions';
import {PermissionsConverter} from '../permissions/permissions.converter';
import {RouterAction} from '../router/router.action';
import {convertAttributeDtoToModel, convertAttributeModelToDto} from './attribute.converter';
import {Attribute, Collection} from './collection';
import {
  convertCollectionDtoToModel,
  convertCollectionModelToDto,
  convertImportedCollectionModelToDto,
} from './collection.converter';
import {CollectionsAction, CollectionsActionType} from './collections.action';
import {
  selectCollectionAttributeById,
  selectCollectionById,
  selectCollectionsDictionary,
  selectCollectionsLoaded,
} from './collections.state';
import mixpanel from 'mixpanel-browser';
import {CollectionService} from '../../data-service';
import {OrganizationsAction} from '../organizations/organizations.action';
import {createCallbackActions} from '../store.utils';

@Injectable()
export class CollectionsEffects {
  @Effect()
  public get$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.Get>(CollectionsActionType.GET),
    withLatestFrom(this.store$.pipe(select(selectCollectionsLoaded))),
    filter(([action, loaded]) => action.payload.force || !loaded),
    map(([action]) => action),
    mergeMap(action => {
      return this.collectionService.getCollections(action.payload.workspace).pipe(
        map((dtos: CollectionDto[]) => dtos.map(dto => convertCollectionDtoToModel(dto))),
        map(collections => new CollectionsAction.GetSuccess({collections: collections})),
        catchError(error => of(new CollectionsAction.GetFailure({error})))
      );
    })
  );

  @Effect()
  public getSingle$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.GetSingle>(CollectionsActionType.GET_SINGLE),
    mergeMap(action => {
      return this.collectionService.getCollection(action.payload.collectionId).pipe(
        map((dto: CollectionDto) => convertCollectionDtoToModel(dto)),
        map(collection => new CollectionsAction.GetSuccess({collections: [collection]})),
        catchError(error => of(new CollectionsAction.GetFailure({error})))
      );
    })
  );

  @Effect()
  public getFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.GetFailure>(CollectionsActionType.GET_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collections.get.fail', value: 'Could not get tables'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public create$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.Create>(CollectionsActionType.CREATE),
    mergeMap(action => {
      const {collection, callback} = action.payload;
      const collectionDto = convertCollectionModelToDto(collection);

      return this.collectionService.createCollection(collectionDto).pipe(
        map(dto => convertCollectionDtoToModel(dto, collection.correlationId)),
        withLatestFrom(this.store$.pipe(select(selectCollectionsDictionary))),
        mergeMap(([newCollection, collections]) => {
          if (environment.analytics) {
            this.angulartics2.eventTrack.next({
              action: 'Collection create',
              properties: {
                category: 'Application Resources',
                label: 'count',
                value: Object.keys(collections).length + 1,
              },
            });

            if (environment.mixpanelKey) {
              mixpanel.track('Collection Create', {
                count: Object.keys(collections).length + 1,
                name: action.payload.collection.name,
              });
            }
          }

          const actions: Action[] = [new CollectionsAction.CreateSuccess({collection: newCollection})];

          if (callback) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => callback(newCollection)}));
          }

          return actions;
        }),
        catchError(error => of(new CollectionsAction.CreateFailure({error})))
      );
    })
  );

  @Effect()
  public createFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.CreateFailure>(CollectionsActionType.CREATE_FAILURE),
    tap(action => console.error(action.payload.error)),
    withLatestFrom(this.store$.pipe(select(selectOrganizationByWorkspace))),
    map(([action, organization]) => {
      if (action.payload.error instanceof HttpErrorResponse && Number(action.payload.error.status) === 402) {
        const message = this.i18n({
          id: 'collection.create.serviceLimits',
          value:
            'You are currently on the Free plan which allows you to have only limited number of tables. Do you want to upgrade to Business now?',
        });
        return new OrganizationsAction.OfferPayment({message, organizationCode: organization.code});
      }
      const errorMessage = this.i18n({id: 'collection.create.fail', value: 'Could not create table'});
      return new NotificationsAction.Error({message: errorMessage});
    })
  );

  @Effect()
  public import$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.Import>(CollectionsActionType.IMPORT),
    mergeMap(action => {
      const dto = convertImportedCollectionModelToDto(action.payload.importedCollection);
      return this.importService.importFile(action.payload.format, dto).pipe(
        map(collection => convertCollectionDtoToModel(collection)),
        mergeMap(collection => {
          const actions: Action[] = [new CollectionsAction.ImportSuccess({collection: collection})];

          const {callback} = action.payload;
          if (callback) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => callback(collection)}));
          }

          return actions;
        }),
        catchError(error => of(new CollectionsAction.ImportFailure({error})))
      );
    })
  );

  @Effect()
  public importFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.ImportFailure>(CollectionsActionType.IMPORT_FAILURE),
    tap(action => console.error(action.payload.error)),
    withLatestFrom(this.store$.pipe(select(selectOrganizationByWorkspace))),
    map(([action, organization]) => {
      if (action.payload.error instanceof HttpErrorResponse && Number(action.payload.error.status) === 402) {
        const message = this.i18n({
          id: 'collection.create.serviceLimits',
          value:
            'You are currently on the Free plan which allows you to have only limited number of tables. Do you want to upgrade to Business now?',
        });
        return new OrganizationsAction.OfferPayment({message, organizationCode: organization.code});
      }
      const errorMessage = this.i18n({id: 'collection.import.fail', value: 'Could not import table'});
      return new NotificationsAction.Error({message: errorMessage});
    })
  );

  @Effect()
  public update$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.Update>(CollectionsActionType.UPDATE),
    withLatestFrom(this.store$.pipe(select(selectCollectionsDictionary))),
    mergeMap(([action, collections]) => {
      const collectionDto = convertCollectionModelToDto(action.payload.collection);
      const oldCollection = collections[collectionDto.id];
      const correlationId = oldCollection && oldCollection.correlationId;

      return this.collectionService.updateCollection(collectionDto).pipe(
        map((dto: CollectionDto) => convertCollectionDtoToModel(dto, correlationId)),
        mergeMap(collection => {
          const actions: Action[] = [new CollectionsAction.UpdateSuccess({collection})];

          const {callback} = action.payload;
          if (callback) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => callback()}));
          }

          return actions;
        }),
        catchError(error => of(new CollectionsAction.UpdateFailure({error})))
      );
    })
  );

  @Effect()
  public updateFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.UpdateFailure>(CollectionsActionType.UPDATE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collection.update.fail', value: 'Could not update table'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public delete$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.Delete>(CollectionsActionType.DELETE),
    mergeMap(action =>
      this.collectionService.removeCollection(action.payload.collectionId).pipe(
        mergeMap(collectionId => {
          const actions: Action[] = [new CollectionsAction.DeleteSuccess({collectionId})];

          const {callback} = action.payload;
          if (callback) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => callback(collectionId)}));
          }

          return actions;
        }),
        catchError(error => of(new CollectionsAction.DeleteFailure({error})))
      )
    )
  );

  @Effect()
  public deleteSuccess$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.DeleteSuccess>(CollectionsActionType.DELETE_SUCCESS),
    withLatestFrom(this.store$.pipe(select(selectNavigation))),
    mergeMap(([action, navigation]) => {
      const {collectionId} = action.payload;
      const actions: Action[] = [new DocumentsAction.ClearByCollection({collectionId})];
      const isCollectionSettingsPage =
        navigation && navigation.workspace && navigation.workspace.collectionId === collectionId;
      if (isCollectionSettingsPage) {
        return [...actions, new RouterAction.Go({path: ['/']})];
      }

      return actions;
    })
  );

  @Effect()
  public deleteFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.DeleteFailure>(CollectionsActionType.DELETE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collection.delete.fail', value: 'Could not delete table'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public addFavorite$ = this.actions$.pipe(
    ofType<CollectionsAction.AddFavorite>(CollectionsActionType.ADD_FAVORITE),
    mergeMap(action =>
      this.collectionService.addFavorite(action.payload.collectionId).pipe(
        mergeMap(() => of()),
        catchError(error =>
          of(new CollectionsAction.AddFavoriteFailure({collectionId: action.payload.collectionId, error}))
        )
      )
    )
  );

  @Effect()
  public addFavoriteFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.AddFavoriteFailure>(CollectionsActionType.ADD_FAVORITE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({
        id: 'collection.add.favorite.fail',
        value: 'Could not add the table to favorites',
      });
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public removeFavorite$ = this.actions$.pipe(
    ofType<CollectionsAction.RemoveFavorite>(CollectionsActionType.REMOVE_FAVORITE),
    mergeMap(action =>
      this.collectionService.removeFavorite(action.payload.collectionId).pipe(
        mergeMap(() => of()),
        catchError(error =>
          of(new CollectionsAction.RemoveFavoriteFailure({collectionId: action.payload.collectionId, error}))
        )
      )
    )
  );

  @Effect()
  public removeFavoriteFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.RemoveFavoriteFailure>(CollectionsActionType.REMOVE_FAVORITE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({
        id: 'collection.remove.favorite.fail',
        value: 'Could not remove the table from favorites',
      });
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public renameAttribute$ = this.actions$.pipe(
    ofType<CollectionsAction.RenameAttribute>(CollectionsActionType.RENAME_ATTRIBUTE),
    withLatestFrom(this.store$.pipe(select(selectCollectionsDictionary))),
    tap(([action]) => this.store$.dispatch(new CollectionsAction.RenameAttributeSuccess(action.payload))),
    mergeMap(([action, collections]) => {
      const {collectionId, attributeId, name} = action.payload;
      const collection = collections[collectionId];
      const attribute = collection?.attributes?.find(attr => attr.id === attributeId);
      const oldName = attribute?.name;
      const attributeDto = convertAttributeModelToDto({...attribute, name});
      return this.collectionService.updateAttribute(collectionId, attributeId, attributeDto).pipe(
        mergeMap(() => of()),
        catchError(error =>
          of(new CollectionsAction.RenameAttributeFailure({error, collectionId, attributeId, oldName}))
        )
      );
    })
  );

  @Effect()
  public setDefaultAttribute$ = this.actions$.pipe(
    ofType<CollectionsAction.SetDefaultAttribute>(CollectionsActionType.SET_DEFAULT_ATTRIBUTE),
    tap(action => this.store$.dispatch(new CollectionsAction.SetDefaultAttributeSuccess(action.payload))),
    withLatestFrom(this.store$.pipe(select(selectCollectionsDictionary))),
    mergeMap(([action, collections]) => {
      const {collectionId, attributeId} = action.payload;
      const collection = collections[collectionId];
      const oldDefaultAttributeId = collection.defaultAttributeId;
      return this.collectionService.setDefaultAttribute(collectionId, attributeId).pipe(
        mergeMap(() => of()),
        catchError(error =>
          of(new CollectionsAction.SetDefaultAttributeFailure({error, collectionId, oldDefaultAttributeId}))
        )
      );
    })
  );

  @Effect()
  public setDefaultAttributeFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.SetDefaultAttributeFailure>(CollectionsActionType.SET_DEFAULT_ATTRIBUTE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({
        id: 'collection.attribute.default.set.fail',
        value: 'Could not set the displayed attribute id',
      });
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public createAttributes$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.CreateAttributes>(CollectionsActionType.CREATE_ATTRIBUTES),
    mergeMap(action => {
      const attributesDto = action.payload.attributes.map(attr => convertAttributeModelToDto(attr));
      const correlationIdMap = action.payload.attributes.reduce((acc, attr) => {
        acc[attr.name] = attr.correlationId;
        return acc;
      }, {});

      const {onSuccess, onFailure, nextAction, collectionId} = action.payload;
      return this.collectionService.createAttributes(collectionId, attributesDto).pipe(
        map(attributes => attributes.map(attr => convertAttributeDtoToModel(attr, correlationIdMap[attr.name]))),
        withLatestFrom(this.store$.pipe(select(selectCollectionById(collectionId)))),
        mergeMap(([attributes, collection]) => {
          const actions: Action[] = [
            new CollectionsAction.CreateAttributesSuccess({
              collectionId,
              attributes,
            }),
          ];
          if (nextAction) {
            actions.push(updateCreateAttributesNextAction(nextAction, attributes));
          }
          if (!collection.defaultAttributeId) {
            const setDefaultAttributeAction = createSetDefaultAttributeAction(collection, attributes);
            if (setDefaultAttributeAction) {
              actions.push(setDefaultAttributeAction);
            }
          }
          actions.push(...createCallbackActions(onSuccess, attributes));
          return actions;
        }),
        catchError(error =>
          of(...createCallbackActions(onFailure), new CollectionsAction.CreateAttributesFailure({error}))
        )
      );
    })
  );

  @Effect()
  public createAttributesFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.CreateAttributesFailure>(CollectionsActionType.CREATE_ATTRIBUTES_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collection.create.attributes.fail', value: 'Could not create attributes'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public changeAttribute$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.ChangeAttribute>(CollectionsActionType.CHANGE_ATTRIBUTE),
    mergeMap(action => {
      const {attributeId, collectionId, onSuccess, onFailure} = action.payload;
      const attributeDto = convertAttributeModelToDto(action.payload.attribute);

      return this.collectionService.updateAttribute(collectionId, attributeId, attributeDto).pipe(
        map(result => convertAttributeDtoToModel(result)),
        mergeMap(attribute => {
          const actions: Action[] = [
            new CollectionsAction.ChangeAttributeSuccess({collectionId, attributeId, attribute: attribute}),
          ];
          if (action.payload.nextAction) {
            actions.push(action.payload.nextAction);
          }
          if (onSuccess) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => onSuccess(attribute)}));
          }
          return actions;
        }),
        catchError(error => {
          const actions: Action[] = [new CollectionsAction.ChangeAttributeFailure({error})];
          if (onFailure) {
            actions.push(new CommonAction.ExecuteCallback({callback: () => onFailure(error)}));
          }
          return from(actions);
        })
      );
    })
  );

  @Effect()
  public changeAttributeFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.ChangeAttributeFailure>(CollectionsActionType.CHANGE_ATTRIBUTE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collection.change.attribute.fail', value: 'Could not change the attribute'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public removeAttribute$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.RemoveAttribute>(CollectionsActionType.REMOVE_ATTRIBUTE),
    mergeMap(action => {
      const {collectionId, attributeId} = action.payload;
      return this.store$.pipe(
        select(selectCollectionAttributeById(collectionId, attributeId)),
        take(1),
        mergeMap(attribute =>
          this.collectionService.removeAttribute(collectionId, attributeId).pipe(
            withLatestFrom(this.store$.pipe(select(selectCollectionById(collectionId)))),
            mergeMap(([, collection]) => {
              const actions: Action[] = [new CollectionsAction.RemoveAttributeSuccess({collectionId, attribute})];
              if (collection.defaultAttributeId === attributeId || !collection.defaultAttributeId) {
                const setDefaultAttributeAction = createSetDefaultAttributeAction(collection, null, attributeId);
                if (setDefaultAttributeAction) {
                  actions.push(setDefaultAttributeAction);
                }
              }
              return actions;
            }),
            catchError(error => of(new CollectionsAction.RemoveAttributeFailure({error})))
          )
        )
      );
    })
  );

  @Effect()
  public removeAttributeFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.RemoveAttributeFailure>(CollectionsActionType.REMOVE_ATTRIBUTE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'collection.remove.attribute.fail', value: 'Could not delete the attribute'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public changePermission$ = this.actions$.pipe(
    ofType<CollectionsAction.ChangePermission>(CollectionsActionType.CHANGE_PERMISSION),
    mergeMap(action => {
      const workspace = action.payload.workspace;
      const dtos = action.payload.permissions.map(permission => PermissionsConverter.toPermissionDto(permission));

      let observable;
      if (action.payload.type === PermissionType.Users) {
        observable = this.collectionService.updateUserPermission(dtos, workspace);
      } else {
        observable = this.collectionService.updateGroupPermission(dtos, workspace);
      }
      return observable.pipe(
        mergeMap(() => EMPTY),
        catchError(error => {
          const payload = {
            collectionId: workspace.collectionId || action.payload.collectionId,
            type: action.payload.type,
            permissions: action.payload.currentPermissions,
            error,
          };
          return of(new CollectionsAction.ChangePermissionFailure(payload));
        })
      );
    })
  );

  @Effect()
  public changePermissionFailure$: Observable<Action> = this.actions$.pipe(
    ofType<CollectionsAction.ChangePermissionFailure>(CollectionsActionType.CHANGE_PERMISSION_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({
        id: 'collection.change.permission.fail',
        value: 'Could not change the table permissions',
      });
      return new NotificationsAction.Error({message});
    })
  );

  constructor(
    private actions$: Actions,
    private store$: Store<AppState>,
    private collectionService: CollectionService,
    private i18n: I18n,
    private importService: ImportService,
    private angulartics2: Angulartics2
  ) {}
}

function createSetDefaultAttributeAction(
  collection: Collection,
  suppliedAttributes?: Attribute[],
  excludeAttributeId?: string
): Action {
  const attributes =
    collection.attributes && collection.attributes.length > 0 ? collection.attributes : suppliedAttributes || [];

  const filteredAttributes = excludeAttributeId ? attributes.filter(a => a.id !== excludeAttributeId) : attributes;

  if (filteredAttributes && filteredAttributes.length > 0) {
    return new CollectionsAction.SetDefaultAttribute({
      collectionId: collection.id,
      attributeId: filteredAttributes[0].id,
    });
  }

  return null;
}

function updateCreateAttributesNextAction(action: DocumentsAction.All, attributes: Attribute[]): Action {
  switch (action.type) {
    case DocumentsActionType.CREATE:
      return new DocumentsAction.Create({...action.payload, document: convertNewAttributes(attributes, action)});
    case DocumentsActionType.PATCH_DATA:
      return new DocumentsAction.PatchData({...action.payload, document: convertNewAttributes(attributes, action)});
    case DocumentsActionType.UPDATE_DATA:
      return new DocumentsAction.UpdateData({...action.payload, document: convertNewAttributes(attributes, action)});
    default:
      return action;
  }
}

function convertNewAttributes(
  attributes: Attribute[],
  action: DocumentsAction.Create | DocumentsAction.UpdateData | DocumentsAction.PatchData
): DocumentModel {
  const document = action.payload.document;
  const newAttributes = Object.keys(document.newData).reduce((acc, attrName) => {
    const attribute = attributes.find(attr => attr.name === attrName);
    if (attribute) {
      acc[attribute.id] = document.newData[attrName].value;
    }
    return acc;
  }, {});

  const newData = {...document.data, ...newAttributes};
  return {...document, data: newData};
}
