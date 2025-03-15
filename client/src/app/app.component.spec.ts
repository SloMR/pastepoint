import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
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

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'PastePoint' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('PastePoint');
  });

  it('should render the title by showing the content', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
