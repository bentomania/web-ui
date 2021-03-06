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

import {PivotConfig, PivotConfigVersion} from './pivot';
import {PivotConfigV0} from './pivot-old';
import {isNotNullOrUndefined} from '../../../shared/utils/common.utils';

export function convertPivotConfigDtoToModel(config: any): PivotConfig {
  if (!config) {
    return config;
  }
  const version = isNotNullOrUndefined(config.version) ? String(config.version) : '';
  switch (version) {
    case PivotConfigVersion.V1:
      return convertPivotConfigDtoToModelV1(config);
    default:
      return convertPivotConfigDtoToModelV0(config);
  }
}

function convertPivotConfigDtoToModelV1(config: PivotConfig): PivotConfig {
  return config;
}

function convertPivotConfigDtoToModelV0(config: PivotConfigV0): PivotConfig {
  return {version: PivotConfigVersion.V1, stemsConfigs: [config]};
}
