import { Navigate } from "react-router-dom";
import { tokenService } from "../utils/tokenService";

const ProtectedRoute = ({ children }) => {
  if (!tokenService.isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
