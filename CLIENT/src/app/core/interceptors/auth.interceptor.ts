import { HttpInterceptorFn } from '@angular/common/http';
import { TOKEN_KEY } from '../services/auth.service';
import { readStorage } from '../utils/storage';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const token = readStorage(TOKEN_KEY);

  if (!token) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
