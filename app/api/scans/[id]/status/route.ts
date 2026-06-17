import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = createServerClient();
  const { data } = await supabase
    .from("scans")
    .select("status, risk_score, summary")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ error: "Scan not found." }, { status: 404 });
  }

  return NextResponse.json(data);
}
