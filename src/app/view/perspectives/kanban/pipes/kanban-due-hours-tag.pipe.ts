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

import {Pipe, PipeTransform} from '@angular/core';
import {COLOR_DANGER, COLOR_WARNING} from '../../../../core/constants';
import {I18n} from '@ngx-translate/i18n-polyfill';
import {PostItTag} from '../../../../shared/post-it/post-it.component';
import {isNotNullOrUndefined} from '../../../../shared/utils/common.utils';

@Pipe({
  name: 'kanbanDueHoursTag',
})
export class KanbanDueHoursTagPipe implements PipeTransform {
  constructor(private i18n: I18n) {}

  public transform(dueHours: number): PostItTag {
    if (isNotNullOrUndefined(dueHours)) {
      if (dueHours < 0) {
        return {
          title: this.i18n({id: 'kanban.dueHours.tag.pastDue', value: 'Past due'}),
          color: COLOR_DANGER,
        };
      }
      if (dueHours < 25) {
        return {
          title: this.i18n({id: 'kanban.dueHours.tag.dueSoon', value: 'Due soon'}),
          color: COLOR_WARNING,
        };
      }
    }

    return null;
  }
}
