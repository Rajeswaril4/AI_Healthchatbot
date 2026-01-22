import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { tokenService } from "../utils/tokenService";

const AuthGoogleCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      tokenService.setToken(token);
      navigate("/dashboard", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return <p>Signing you in...</p>;
};

export default AuthGoogleCallback;
