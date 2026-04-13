import { NextResponse } from "next/server";
import { deleteInspirationById, getUser } from "@/lib/db/queries";

async function requireSuperadmin() {
  const user = await getUser();
  if (!user) {
    return { user: null, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (user.role !== "superadmin") {
    return { user: null, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { user, response: null };
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperadmin();
  if (auth.response) return auth.response;

  const { id } = await params;
  const parsedId = Number(id);

  if (!Number.isInteger(parsedId) || parsedId <= 0) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const deleted = await deleteInspirationById(parsedId);
  if (!deleted) {
    return NextResponse.json({ error: "Inspiration not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
