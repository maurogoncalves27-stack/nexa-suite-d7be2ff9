// Página pública de status do pedido. Será populada na Etapa 4.
import { useParams } from "react-router-dom";
import { PedirLayout } from "./PedirLayout";

export default function PedirPedido() {
  const { id } = useParams<{ id: string }>();
  return (
    <PedirLayout>
      <div className="mx-auto max-w-md rounded-2xl border bg-white p-6 text-center">
        <h1 className="text-xl font-black">Acompanhar pedido</h1>
        <p className="mt-1 text-xs opacity-70">Pedido #{id?.slice(0, 8)}</p>
        <p className="mt-6 text-sm opacity-70">
          A página de status será ativada na próxima etapa, junto com o pagamento.
        </p>
      </div>
    </PedirLayout>
  );
}
