// A second router is a second context, so `useNavigate` inside an extension
// would throw. Only what the app itself already uses — anything more would keep
// code alive that the build otherwise drops.
export {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router'
