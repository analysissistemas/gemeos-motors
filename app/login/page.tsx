import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { obterUsuario } from "@/lib/auth/dal";
import { FormularioLogin } from "./formulario";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  if (await obterUsuario()) redirect("/sistema");
  const { de } = await searchParams;
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="painel w-full max-w-sm p-7">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="claro:rounded-2xl claro:bg-black claro:px-3 claro:py-2">
            <Image src="/fotos/logo-gemeos-motors.webp" alt="Gêmeos Motors" width={140} height={70} priority className="h-auto w-[132px]" />
          </div>
          <h1 className="mt-5 text-[20px] font-bold tracking-tight">Área da equipe</h1>
          <p className="mt-1 text-[13px] text-ink-2">Atendimento, funil, vendas, estoque e assistência.</p>
        </div>
        <FormularioLogin de={de} />
        <Link href="/" className="mt-6 block text-center text-[12.5px] text-ink-3 hover:text-ink">
          ← Voltar para a loja
        </Link>
      </div>
    </main>
  );
}
