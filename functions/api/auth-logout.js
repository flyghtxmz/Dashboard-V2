export async function onRequestPost() {
  return new Response(JSON.stringify({ code: "success" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": "__session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0",
    },
  });
}
