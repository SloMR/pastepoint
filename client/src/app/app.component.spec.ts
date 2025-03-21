import { TestBed } from '@angular/core/testing';
import { TestImports, TestProviders } from './testing/test-helper';
import { PLATFORM_ID } from '@angular/core';
import { NgIf } from '@angular/common';
import { provideRouter } from '@angular/router';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgIf, ...TestImports],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        ...TestProviders,
        provideRouter([]),
      ],
    }).compileComponents();
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});
