import { useEffect } from "react";

export default function SurpresaPage() {
  useEffect(() => {
    window.location.replace("/surpresa.html");
  }, []);

  return null;
}

