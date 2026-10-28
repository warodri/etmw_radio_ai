import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    title: 'ETMW Radio AI',
    loadComponent: () => import('./screens/home/home').then((component) => component.Home),
  },
  {
    path: 'profile',
    title: 'Your account · ETMW Radio AI',
    loadComponent: () =>
      import('./screens/profile/profile').then((component) => component.Profile),
  },
  {
    path: 'studio/new',
    title: 'New station · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/station-wizard/station-wizard').then(
        (component) => component.StationWizard,
      ),
  },
  {
    path: 'studio/:slug/edit',
    title: 'Edit station · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/station-wizard/station-wizard').then(
        (component) => component.StationWizard,
      ),
  },
  {
    path: 'studio/:slug/creator',
    title: 'Creator dashboard · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/creator-dashboard/creator-dashboard').then(
        (component) => component.CreatorDashboard,
      ),
  },
  {
    path: 'studio/:slug/creator/hosts',
    title: 'Host personas · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/hosts-dashboard/hosts-dashboard').then(
        (component) => component.HostsDashboard,
      ),
  },
  {
    path: 'studio/:slug/creator/scripts',
    title: 'Host scripts · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/scripts-dashboard/scripts-dashboard').then(
        (component) => component.ScriptsDashboard,
      ),
  },
  {
    path: 'studio',
    title: 'Your studio · ETMW Radio AI',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./screens/studio/studio-list/studio-list').then(
        (component) => component.StudioList,
      ),
  },
  {
    path: 'stations/:slug',
    title: 'Station · ETMW Radio AI',
    loadComponent: () =>
      import('./screens/station-detail/station-detail').then(
        (component) => component.StationDetail,
      ),
  },
  { path: '**', redirectTo: '' },
];
