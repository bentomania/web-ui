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

import {Injectable} from '@angular/core';
import {Actions, Effect, ofType} from '@ngrx/effects';
import {Action, select, Store} from '@ngrx/store';
import {I18n} from '@ngx-translate/i18n-polyfill';
import {EMPTY, Observable, of} from 'rxjs';
import {catchError, filter, map, mergeMap, take, tap, withLatestFrom} from 'rxjs/operators';
import {LinkTypeDto} from '../../dto';
import {AppState} from '../app.state';
import {convertAttributeDtoToModel, convertAttributeModelToDto} from '../collections/attribute.converter';
import {LinkInstancesAction, LinkInstancesActionType} from '../link-instances/link-instances.action';
import {NotificationsAction} from '../notifications/notifications.action';
import {createCallbackActions, emitErrorActions} from '../store.utils';
import {convertLinkTypeDtoToModel, convertLinkTypeModelToDto} from './link-type.converter';
import {LinkTypesAction, LinkTypesActionType} from './link-types.action';
import {selectLinkTypeAttributeById, selectLinkTypesDictionary, selectLinkTypesLoaded} from './link-types.state';
import {Attribute} from '../collections/collection';
import {LinkInstance} from '../link-instances/link.instance';
import {LinkTypeService} from '../../data-service';
import {selectViewQuery} from '../views/views.state';

@Injectable()
export class LinkTypesEffects {
  @Effect()
  public get$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.Get>(LinkTypesActionType.GET),
    withLatestFrom(this.store$.pipe(select(selectLinkTypesLoaded))),
    filter(([action, loaded]) => action.payload.force || !loaded),
    map(([action]) => action),
    mergeMap(action => {
      return this.linkTypeService.getLinkTypes(action.payload.workspace).pipe(
        map(dtos => dtos.map(dto => convertLinkTypeDtoToModel(dto))),
        map(linkTypes => new LinkTypesAction.GetSuccess({linkTypes: linkTypes})),
        catchError(error => of(new LinkTypesAction.GetFailure({error})))
      );
    })
  );

  @Effect()
  public getSingle$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.GetSingle>(LinkTypesActionType.GET_SINGLE),
    mergeMap(action => {
      return this.linkTypeService.getLinkType(action.payload.linkTypeId).pipe(
        map((dto: LinkTypeDto) => convertLinkTypeDtoToModel(dto)),
        map(linkType => new LinkTypesAction.GetSuccess({linkTypes: [linkType]})),
        catchError(error => of(new LinkTypesAction.GetFailure({error})))
      );
    })
  );

  @Effect()
  public getFailure$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.GetFailure>(LinkTypesActionType.GET_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'link.types.get.fail', value: 'Could not get link types'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public create$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.Create>(LinkTypesActionType.CREATE),
    mergeMap(action => {
      const linkTypeDto = convertLinkTypeModelToDto(action.payload.linkType);

      return this.linkTypeService.createLinkType(linkTypeDto).pipe(
        map(dto => convertLinkTypeDtoToModel(dto, action.payload.linkType.correlationId)),
        mergeMap(linkType => [
          new LinkTypesAction.CreateSuccess({linkType: linkType}),
          ...createCallbackActions(action.payload.onSuccess, linkType),
        ]),
        catchError(error =>
          of(new LinkTypesAction.CreateFailure({error}), ...createCallbackActions(action.payload.onFailure))
        )
      );
    })
  );

  @Effect()
  public createFailure$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.CreateFailure>(LinkTypesActionType.CREATE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'link.type.create.fail', value: 'Could not create the link type'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public update$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.Update>(LinkTypesActionType.UPDATE),
    tap(action => this.store$.dispatch(new LinkTypesAction.UpdateInternal({linkType: action.payload.linkType}))),
    mergeMap(action => {
      const linkTypeDto = convertLinkTypeModelToDto(action.payload.linkType);

      return this.linkTypeService.updateLinkType(action.payload.linkType.id, linkTypeDto).pipe(
        mergeMap(() => EMPTY),
        catchError(error => of(new LinkTypesAction.UpdateFailure({error, linkType: action.payload.linkType})))
      );
    })
  );

  @Effect()
  public updateFailure$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.UpdateFailure>(LinkTypesActionType.UPDATE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'link.type.update.fail', value: 'Could not update the link type'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public delete$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.Delete>(LinkTypesActionType.DELETE),
    mergeMap(action =>
      this.linkTypeService.deleteLinkType(action.payload.linkTypeId).pipe(
        map(linkTypeId => new LinkTypesAction.DeleteSuccess({linkTypeId: linkTypeId})),
        catchError(error => of(new LinkTypesAction.DeleteFailure({error})))
      )
    )
  );

  @Effect()
  public deleteSuccess$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.DeleteSuccess>(LinkInstancesActionType.DELETE_SUCCESS),
    withLatestFrom(this.store$.pipe(select(selectViewQuery))),
    mergeMap(([action]) => {
      const {linkTypeId} = action.payload;
      const actions: Action[] = [new LinkInstancesAction.ClearByLinkType({linkTypeId})];

      return actions;
    })
  );

  @Effect()
  public deleteFailure$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.DeleteFailure>(LinkTypesActionType.DELETE_FAILURE),
    tap(action => console.error(action.payload.error)),
    map(() => {
      const message = this.i18n({id: 'link.type.delete.fail', value: 'Could not delete the link type'});
      return new NotificationsAction.Error({message});
    })
  );

  @Effect()
  public createAttributes$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.CreateAttributes>(LinkTypesActionType.CREATE_ATTRIBUTES),
    mergeMap(action => {
      const attributesDto = action.payload.attributes.map(attr => convertAttributeModelToDto(attr));
      const correlationIdsMap = action.payload.attributes.reduce((correlationMap, attr) => {
        correlationMap[attr.name] = attr.correlationId;
        return correlationMap;
      }, {});

      const {linkTypeId, onSuccess, onFailure, nextAction} = action.payload;
      return this.linkTypeService.createAttributes(linkTypeId, attributesDto).pipe(
        map(attributes => attributes.map(attr => convertAttributeDtoToModel(attr, correlationIdsMap[attr.name]))),
        mergeMap(attributes => {
          const actions: Action[] = [new LinkTypesAction.CreateAttributesSuccess({linkTypeId, attributes})];
          if (nextAction) {
            actions.push(updateCreateAttributesNextAction(nextAction, attributes));
          }

          actions.push(...createCallbackActions(onSuccess, attributes));
          return actions;
        }),
        catchError(error => emitErrorActions(error, onFailure))
      );
    })
  );

  @Effect()
  public updateAttribute$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.UpdateAttribute>(LinkTypesActionType.UPDATE_ATTRIBUTE),
    mergeMap(action => {
      const {attributeId, linkTypeId, onSuccess, onFailure} = action.payload;
      const attributeDto = convertAttributeModelToDto(action.payload.attribute);

      return this.linkTypeService.updateAttribute(linkTypeId, attributeId, attributeDto).pipe(
        map(dto => convertAttributeDtoToModel(dto)),
        mergeMap(attribute => [
          new LinkTypesAction.UpdateAttributeSuccess({linkTypeId, attribute}),
          ...createCallbackActions(onSuccess, attribute),
        ]),
        catchError(error => emitErrorActions(error, onFailure))
      );
    })
  );

  @Effect()
  public renameAttribute$ = this.actions$.pipe(
    ofType<LinkTypesAction.RenameAttribute>(LinkTypesActionType.RENAME_ATTRIBUTE),
    withLatestFrom(this.store$.pipe(select(selectLinkTypesDictionary))),
    tap(([action]) => this.store$.dispatch(new LinkTypesAction.RenameAttributeSuccess(action.payload))),
    mergeMap(([action, linkTypesMap]) => {
      const {linkTypeId, attributeId, name} = action.payload;
      const linkType = linkTypesMap[linkTypeId];
      const attribute = linkType?.attributes?.find(attr => attr.id === attributeId);
      const oldName = attribute?.name;
      const attributeDto = convertAttributeModelToDto({...attribute, name});
      return this.linkTypeService.updateAttribute(linkTypeId, attributeId, attributeDto).pipe(
        mergeMap(() => of()),
        catchError(error => of(new LinkTypesAction.RenameAttributeFailure({error, linkTypeId, attributeId, oldName})))
      );
    })
  );

  @Effect()
  public deleteAttribute$: Observable<Action> = this.actions$.pipe(
    ofType<LinkTypesAction.DeleteAttribute>(LinkTypesActionType.DELETE_ATTRIBUTE),
    mergeMap(action => {
      const {linkTypeId, attributeId, onSuccess, onFailure} = action.payload;
      return this.store$.pipe(
        select(selectLinkTypeAttributeById(linkTypeId, attributeId)),
        take(1),
        mergeMap(attribute => {
          return this.linkTypeService.deleteAttribute(linkTypeId, attributeId).pipe(
            mergeMap(() => [
              new LinkTypesAction.DeleteAttributeSuccess({linkTypeId, attribute}),
              ...createCallbackActions(onSuccess),
            ]),
            catchError(error => emitErrorActions(error, onFailure))
          );
        })
      );
    })
  );

  constructor(
    private actions$: Actions,
    private i18n: I18n,
    private linkTypeService: LinkTypeService,
    private store$: Store<AppState>
  ) {}
}

function updateCreateAttributesNextAction(action: LinkInstancesAction.All, attributes: Attribute[]): Action {
  switch (action.type) {
    case LinkInstancesActionType.CREATE:
      return new LinkInstancesAction.Create({
        ...action.payload,
        linkInstance: convertNewAttributes(attributes, action),
      });
    case LinkInstancesActionType.PATCH_DATA:
      return new LinkInstancesAction.PatchData({
        ...action.payload,
        linkInstance: convertNewAttributes(attributes, action),
      });
    case LinkInstancesActionType.UPDATE_DATA:
      return new LinkInstancesAction.UpdateData({
        ...action.payload,
        linkInstance: convertNewAttributes(attributes, action),
      });
    default:
      return action;
  }
}

function convertNewAttributes(
  attributes: Attribute[],
  action: LinkInstancesAction.Create | LinkInstancesAction.UpdateData | LinkInstancesAction.PatchData
): LinkInstance {
  const linkInstance = action.payload.linkInstance;
  const newAttributes = Object.keys(linkInstance.newData).reduce((acc, attrName) => {
    const attribute = attributes.find(attr => attr.name === attrName);
    if (attribute) {
      acc[attribute.id] = linkInstance.newData[attrName].value;
    }
    return acc;
  }, {});

  const newData = {...linkInstance.data, ...newAttributes};
  return {...linkInstance, data: newData};
}
