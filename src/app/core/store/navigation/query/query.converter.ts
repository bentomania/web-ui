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

import {isNullOrUndefined} from '../../../../shared/utils/common.utils';
import {QueryDto} from '../../../dto';
import {
  AttributeFilterDto,
  CollectionAttributeFilterDto,
  LinkAttributeFilterDto,
  QueryStemDto,
} from '../../../dto/query.dto';
import {
  AttributeFilter,
  CollectionAttributeFilter,
  LinkAttributeFilter,
  Query,
  QueryCondition,
  QueryStem,
} from './query';
import {decodeQueryParam, encodeQueryParam} from '../query-param-encoding';
import {prolongQuery, ShortenedQuery, shortenQuery} from './shortened-query';

export function convertQueryDtoToModel(dto: QueryDto): Query {
  return {
    stems: dto.stems && dto.stems.map(stem => convertQueryStemDtoToModel(stem)),
    fulltexts: dto.fulltexts,
    page: dto.page,
    pageSize: dto.pageSize,
  };
}

export function convertQueryModelToDto(model: Query): QueryDto {
  return {
    stems: model.stems && model.stems.map(stem => convertQueryStemModelToDto(stem)),
    fulltexts: model.fulltexts,
    page: model.page,
    pageSize: model.pageSize,
  };
}

function convertQueryStemDtoToModel(dto: QueryStemDto): QueryStem {
  return {
    collectionId: dto.collectionId,
    documentIds: dto.documentIds,
    linkTypeIds: dto.linkTypeIds,
    filters: dto.filters && dto.filters.map(filter => convertCollectionAttributeFilterDtoToModel(filter)),
    linkFilters: dto.linkFilters && dto.linkFilters.map(filter => convertLinkAttributeFilterDtoToModel(filter)),
  };
}

function convertQueryStemModelToDto(model: QueryStem): QueryStemDto {
  return {
    collectionId: model.collectionId,
    documentIds: model.documentIds,
    linkTypeIds: model.linkTypeIds,
    filters: model.filters && model.filters.map(filter => convertCollectionAttributeFilterModelToDto(filter)),
    linkFilters: model.linkFilters && model.linkFilters.map(filter => convertLinkAttributeFilterModelToDto(filter)),
  };
}

function convertCollectionAttributeFilterDtoToModel(dto: CollectionAttributeFilterDto): CollectionAttributeFilter {
  return {
    collectionId: dto.collectionId,
    ...convertAttributeFilterDtoToModel(dto),
  };
}

function convertAttributeFilterDtoToModel(dto: AttributeFilterDto): AttributeFilter {
  return {
    attributeId: dto.attributeId,
    condition: conditionFromString(dto.condition),
    conditionValues: (dto.conditionValues || []).map(item => ({value: item.value, type: item.type})),
  };
}

function convertLinkAttributeFilterDtoToModel(dto: LinkAttributeFilterDto): LinkAttributeFilter {
  return {
    linkTypeId: dto.linkTypeId,
    ...convertAttributeFilterDtoToModel(dto),
  };
}

function convertCollectionAttributeFilterModelToDto(model: CollectionAttributeFilter): CollectionAttributeFilterDto {
  return {
    collectionId: model.collectionId,
    ...convertAttributeFilterModelToDto(model),
  };
}

function convertAttributeFilterModelToDto(model: AttributeFilter): AttributeFilterDto {
  return {
    attributeId: model.attributeId,
    condition: model.condition,
    conditionValues: (model.conditionValues || []).map(item => ({value: item.value, type: item.type})),
  };
}

function convertLinkAttributeFilterModelToDto(model: LinkAttributeFilter): LinkAttributeFilterDto {
  return {
    linkTypeId: model.linkTypeId,
    ...convertAttributeFilterModelToDto(model),
  };
}

export function convertQueryModelToString(query: Query): string {
  return encodeQueryParam(stringifyQuery(shortenQuery(query)));
}

function stringifyQuery(query: ShortenedQuery): string {
  if (!query) {
    return '';
  }

  return JSON.stringify(query, (key, value) => {
    if (isNullOrUndefined(value) || (value instanceof Array && value.length === 0)) {
      return undefined;
    }
    return value;
  });
}

export function convertQueryStringToModel(stringQuery: string): Query {
  return normalizeQueryModel(prolongQuery(parseStringQuery(decodeQueryParam(stringQuery))));
}

function parseStringQuery(stringQuery: string): ShortenedQuery {
  try {
    return JSON.parse(stringQuery);
  } catch (e) {
    return null;
  }
}

export function normalizeQueryModel(query: Query): Query {
  return {
    stems: ((query && query.stems) || []).map(stem => normalizeQueryStem(stem)),
    fulltexts: (query && query.fulltexts) || [],
    page: isNullOrUndefined(query && query.page) ? null : query.page,
    pageSize: isNullOrUndefined(query && query.pageSize) ? null : query.pageSize,
  };
}

export function normalizeQueryStem(stem: QueryStem): QueryStem {
  return {
    collectionId: stem.collectionId,
    documentIds: stem.documentIds || [],
    filters: (stem.filters || []).map(filter => normalizeFilter(filter)),
    linkFilters: (stem.linkFilters || []).map(filter => normalizeFilter(filter)),
    linkTypeIds: stem.linkTypeIds || [],
  };
}

function normalizeFilter<T extends AttributeFilter>(filter: T): T {
  return {
    ...filter,
    condition: filter.condition || null,
    conditionValues: (filter.conditionValues || []).map(v => ({value: v.value || null, type: v.type || null})),
  };
}

const EqVariants = [QueryCondition.Equals, '=', '==', 'equals'];
const NeqVariants = [QueryCondition.NotEquals, '!=', '!==', '<>', 'ne', 'nequals'];
const LtVariants = [QueryCondition.LowerThan, '<'];
const LteVariants = [QueryCondition.LowerThanEquals, '<='];
const GtVariants = [QueryCondition.GreaterThan, '>'];
const GteVariants = [QueryCondition.GreaterThanEquals, '>='];

function conditionFromString(condition: string): QueryCondition {
  if (!condition) {
    return null;
  }
  const conditionLowerCase = condition.toLowerCase();
  if (EqVariants.includes(conditionLowerCase)) {
    return QueryCondition.Equals;
  } else if (NeqVariants.includes(conditionLowerCase)) {
    return QueryCondition.NotEquals;
  } else if (LtVariants.includes(conditionLowerCase)) {
    return QueryCondition.LowerThan;
  } else if (LteVariants.includes(conditionLowerCase)) {
    return QueryCondition.LowerThanEquals;
  } else if (GtVariants.includes(conditionLowerCase)) {
    return QueryCondition.GreaterThan;
  } else if (GteVariants.includes(conditionLowerCase)) {
    return QueryCondition.GreaterThanEquals;
  }
  return condition as QueryCondition;
}
