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

import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {DurationDataValue} from '../../../core/model/data-value/duration.data-value';
import {KeyCode} from '../../key-code';
import {setCursorAtDataInputEnd} from '../../utils/html-modifier';
import {ConstraintType} from '../../../core/model/data/constraint';
import {constraintTypeClass} from '../pipes/constraint-class.pipe';
import {CommonDataInputConfiguration} from '../data-input-configuration';
import {DataInputSaveAction, keyboardEventInputSaveAction} from '../data-input-save-action';

@Component({
  selector: 'duration-data-input',
  templateUrl: './duration-data-input.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DurationDataInputComponent implements OnChanges, AfterViewChecked {
  @Input()
  public focus: boolean;

  @Input()
  public readonly: boolean;

  @Input()
  public value: DurationDataValue;

  @Input()
  public configuration: CommonDataInputConfiguration;

  @Output()
  public valueChange = new EventEmitter<DurationDataValue>();

  @Output()
  public save = new EventEmitter<{action: DataInputSaveAction; dataValue: DurationDataValue}>();

  @Output()
  public cancel = new EventEmitter();

  @Output()
  public enterInvalid = new EventEmitter();

  @ViewChild('durationInput')
  public durationInput: ElementRef<HTMLInputElement>;

  public readonly inputClass = constraintTypeClass(ConstraintType.Duration);

  public valid = true;

  private preventSave: boolean;
  private keyDownListener: (event: KeyboardEvent) => void;
  private setFocus: boolean;

  constructor(private element: ElementRef) {}

  public ngOnChanges(changes: SimpleChanges) {
    if (changes.readonly && !this.readonly && this.focus) {
      this.setFocus = true;
    }
    if (changes.value && this.value) {
      this.valid = this.value.isValid();
    }
  }

  public ngAfterViewChecked() {
    if (this.setFocus) {
      this.setFocusToInput();
      this.setFocus = false;
    }
  }

  public setFocusToInput() {
    if (this.durationInput) {
      setCursorAtDataInputEnd(this.durationInput.nativeElement, this.value);
    }
  }

  private addKeyDownListener() {
    this.removeKeyDownListener();

    this.keyDownListener = event => this.onKeyDown(event);
    this.element.nativeElement.addEventListener('keydown', this.keyDownListener);
  }

  private removeKeyDownListener() {
    if (this.keyDownListener) {
      this.element.nativeElement.removeEventListener('keydown', this.keyDownListener);
    }
    this.keyDownListener = null;
  }

  private onKeyDown(event: KeyboardEvent) {
    switch (event.code) {
      case KeyCode.Enter:
      case KeyCode.NumpadEnter:
      case KeyCode.Tab:
        const input = this.durationInput;
        const dataValue = this.value.parseInput(input.nativeElement.value);

        event.preventDefault();

        if (!this.configuration.skipValidation && input && !dataValue.isValid()) {
          event.stopImmediatePropagation();
          this.enterInvalid.emit();
          return;
        }

        this.preventSaveAndBlur();
        this.saveDataValue(dataValue, event);
        return;
      case KeyCode.Escape:
        this.preventSaveAndBlur();
        this.cancel.emit();
        return;
    }
  }

  private saveDataValue(dataValue: DurationDataValue, event: KeyboardEvent) {
    const action = keyboardEventInputSaveAction(event);
    if (this.configuration?.delaySaveAction) {
      // needs to be executed after parent event handlers
      setTimeout(() => this.save.emit({action, dataValue}));
    } else {
      this.save.emit({action, dataValue});
    }
  }

  private preventSaveAndBlur() {
    if (this.durationInput) {
      this.preventSave = true;
      this.durationInput.nativeElement.blur();
    }
  }

  public onInput(event: Event) {
    const element = event.target as HTMLInputElement;
    const dataValue = this.value.parseInput(element.value);
    this.valid = dataValue.isValid();

    this.valueChange.emit(dataValue);
  }

  public onBlur() {
    this.removeKeyDownListener();

    if (this.preventSave) {
      this.preventSave = false;
    } else {
      const dataValue = this.value.parseInput(this.durationInput.nativeElement.value);
      if (this.configuration.skipValidation || dataValue.isValid()) {
        this.save.emit({action: DataInputSaveAction.Blur, dataValue});
      } else {
        this.cancel.emit();
      }
    }
  }

  public onFocus() {
    this.addKeyDownListener();
  }
}
