// Entrada do app NEXA pelo host aquelaparme.com.br/nexa.
// Marca o modo NEXA em sessionStorage para que o HostnameGuard NÃO redirecione
// "/" para "/parme" depois do login, e encaminha para /auth (ou para "/" se
// já estiver logado — o ProtectedRoute resolve).
import { useEffect } from "react";
import { Navigate } from "react-router-dom";

export default function NexaEntry() {
  useEffect(() => {
    try {
      sessionStorage.setItem("nexa-app-mode", "1");
    } catch {
      /* ignore */
    }
  }, []);
  return <Navigate to="/" replace />;
}
