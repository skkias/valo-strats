import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentBySlug } from "@/lib/catalog-queries";
import { AgentAbilityEditor } from "@/components/coach/AgentAbilityEditor";
import { ArrowLeft } from "lucide-react";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · Agent abilities · Coach`,
  };
}

export default async function CoachAgentEditorPage({ params }: Props) {
  const { slug } = await params;
  let agent = null;
  let loadError: string | null = null;
  try {
    agent = await getAgentBySlug(slug);
  } catch (e) {
    loadError =
      e instanceof Error ? e.message : "Could not load agent from Supabase.";
  }

  if (loadError) {
    return (
      <main className="flex flex-1 flex-col px-4 py-8">
        <p className="rounded-lg border border-fuchsia-900/50 bg-fuchsia-950/30 px-4 py-3 text-sm text-fuchsia-200">
          {loadError}
        </p>
      </main>
    );
  }

  if (!agent) notFound();

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-violet-500/15 px-4 py-6">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/coach/agents"
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-violet-400/80 hover:text-violet-200"
          >
            <ArrowLeft className="h-4 w-4" />
            All agents
          </Link>
          <h1 className="text-2xl font-semibold text-white">
            {agent.name}{" "}
            <span className="text-lg font-normal text-violet-400/70">
              · Ability blueprint
            </span>
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-violet-200/65">
            Place geometric ability types on the canvas. Coordinates are normalized
            (0–1000); they are not tied to a specific map—use them as templates for
            callouts and future overlays.
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <AgentAbilityEditor agent={agent} />
      </div>
    </main>
  );
}
