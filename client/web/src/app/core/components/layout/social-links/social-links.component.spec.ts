import { TestBed } from '@angular/core/testing';
import { TestImports, TestProviders } from '../../../../testing/test-helper';

describe('SocialLinksComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [...TestImports],
      providers: [...TestProviders],
    }).compileComponents();
  });

  it('passes without verification', () => {
    // Empty test that always passes
  });
});
