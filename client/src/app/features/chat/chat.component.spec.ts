import { TestBed } from '@angular/core/testing';
import { TestImports, TestProviders } from '../../testing/test-helper';
import { PLATFORM_ID } from '@angular/core';
import { FlowbiteService } from '../../core/services/flowbite.service';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

describe('ChatComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        ...TestProviders,
        provideRouter([]),
        {
          provide: FlowbiteService,
          useValue: {
            loadFlowbite: jasmine.createSpy('loadFlowbite').and.callFake((cb) => cb({})),
          },
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({})),
          },
        },
      ],
    }).compileComponents();
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});
