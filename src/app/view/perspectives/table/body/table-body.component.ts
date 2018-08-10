/*
 * Lumeer: Modern Data Definition and Processing Platform
 *
 * Copyright (C) since 2017 Answer Institute, s.r.o. and/or its affiliates.
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

import {AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, HostListener, Input, ViewChild} from '@angular/core';
import {Store} from '@ngrx/store';
import {AppState} from '../../../../core/store/app.state';
import {QueryModel} from '../../../../core/store/navigation/query.model';
import {TableModel} from '../../../../core/store/tables/table.model';
import {getTableElement} from '../../../../core/store/tables/table.utils';
import {TablesAction} from '../../../../core/store/tables/tables.action';
import {TableRowsComponent} from './rows/table-rows.component';

@Component({
  selector: 'table-body',
  templateUrl: './table-body.component.html',
  styleUrls: ['./table-body.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableBodyComponent implements AfterViewChecked {

  @Input()
  public table: TableModel;

  @Input()
  public query: QueryModel;

  @ViewChild(TableRowsComponent)
  public rowsComponent: TableRowsComponent;

  public constructor(private element: ElementRef,
                     private store: Store<AppState>) {
  }

  public ngAfterViewChecked() {
    this.setScrollbarWidth();
  }

  @HostListener('click', ['$event'])
  public onClick(event: MouseEvent) {
    const rowsClick = this.rowsComponent.element.nativeElement.contains(event.target);
    if (!rowsClick) {
      this.store.dispatch(new TablesAction.SetCursor({cursor: null}));
    }
  }

  public setScrollbarWidth() {
    const element = this.element.nativeElement as HTMLElement;
    const scrollbarWidth = element.offsetWidth - element.clientWidth;

    const tableElement = getTableElement(this.table.id);
    tableElement.style.setProperty('--scrollbar-width', `${scrollbarWidth}px`);
  }

}
