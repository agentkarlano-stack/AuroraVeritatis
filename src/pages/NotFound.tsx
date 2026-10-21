import { Link } from 'react-router';
import { Monogram } from '../components/Logo';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <Monogram className="h-12 w-auto opacity-60" />
      <h1 className="mt-6 text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-mist">The page you requested does not exist or has moved.</p>
      <Link to="/" className="btn-primary mt-6">
        Return home
      </Link>
    </div>
  );
}
