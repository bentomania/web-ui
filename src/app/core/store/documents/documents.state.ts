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

import {createEntityAdapter, EntityState} from '@ngrx/entity';
import {createSelector} from '@ngrx/store';
import {AppState} from '../app.state';
import {Query} from '../navigation/query/query';
import {areQueriesEqualExceptFiltersAndPagination} from '../navigation/query/query.helper';
import {DocumentModel} from './document.model';
import {DataResourceData} from '../../model/resource';
import {selectQuery} from '../navigation/navigation.state';

export interface DocumentsState extends EntityState<DocumentModel> {
  pendingDataUpdates: Record<string, DataResourceData>; // key is correlationId
  queries: Query[];
}

export const documentsAdapter = createEntityAdapter<DocumentModel>({selectId: document => document.id});

export const initialDocumentsState: DocumentsState = documentsAdapter.getInitialState({
  pendingDataUpdates: {},
  queries: [],
});

export const selectDocumentsState = (state: AppState) => state.documents;

export const selectAllDocuments = createSelector(selectDocumentsState, documentsAdapter.getSelectors().selectAll);
export const selectDocumentsDictionary = createSelector(
  selectDocumentsState,
  documentsAdapter.getSelectors().selectEntities
);
export const selectDocumentsQueries = createSelector(selectDocumentsState, documentsState => documentsState.queries);

export const selectCurrentQueryDocumentsLoaded = createSelector(
  selectDocumentsQueries,
  selectQuery,
  (queries, currentQuery) => !!queries.find(query => areQueriesEqualExceptFiltersAndPagination(query, currentQuery))
);

export const selectQueryDocumentsLoaded = (query: Query) =>
  createSelector(
    selectDocumentsQueries,
    queries => !!queries.find(q => areQueriesEqualExceptFiltersAndPagination(q, query))
  );

export const selectDocumentById = (id: string) =>
  createSelector(selectDocumentsDictionary, documentsMap => documentsMap[id]);

export const selectDocumentsByIds = (ids: string[]) =>
  createSelector(selectDocumentsDictionary, documentsMap => (ids || []).map(id => documentsMap[id]).filter(doc => doc));

export const selectDocumentsByCollectionId = (collectionId: string) =>
  createSelector(selectAllDocuments, documents => documents.filter(doc => doc.collectionId === collectionId));

const selectPendingDocumentDataUpdates = createSelector(selectDocumentsState, state => state.pendingDataUpdates);

export const selectPendingDocumentDataUpdatesByCorrelationId = (correlationId: string) =>
  createSelector(selectPendingDocumentDataUpdates, pendingDataUpdates => pendingDataUpdates[correlationId]);
