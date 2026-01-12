import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';

describe('LanguageService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});
