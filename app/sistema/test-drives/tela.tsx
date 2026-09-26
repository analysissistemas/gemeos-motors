"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Botao } from "@/components/ui/botao";
import { AcoesTestDrive, AgendarTestDrive } from "@/components/test-drives/formularios";

/** Botão "Novo test drive" da agenda (cliente de balcão, telefone, etc.). */
export function NovoTestDrive({ equipe }: { equipe: { id: number; nome: string }[] }) {
  const [aberto, setAberto] = useState(false);
  const router = useRouter();
  return (
    <>
      <Botao variante="primario" onClick={() => setAberto(true)}>
        <CalendarPlus className="size-4" /> Novo test drive
      </Botao>
      <AgendarTestDrive aberto={aberto} aoMudar={setAberto} equipe={equipe} aoAgendar={() => router.refresh()} />
    </>
  );
}

export function AcoesItem(p: { id: number; status: string; agendadoPara: Date; conversaId: number | null }) {
  const router = useRouter();
  return <AcoesTestDrive {...p} aoMudar={() => router.refresh()} />;
}
