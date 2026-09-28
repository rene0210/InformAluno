/* Limpa contas de teste sobrando de rodadas anteriores (smoke.% / repro.%). */
import { credencial } from "./credenciais.mjs";

const API = process.env.API_URL || "http://127.0.0.1:8787";

const req = async (method, path, opts = {}) => {
  const { token, body } = opts;
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* sem json */
  }
  return { status: res.status, data };
};

const login = await req("POST", "/api/auth/login", {
  body: { email: "admin@informaluno.com", senha: credencial("ADMIN_SENHA") },
});
if (login.status !== 200) {
  console.log("sem admin");
  process.exit(1);
}
const token = login.data.token;

const lista = await req("GET", "/api/admin/usuarios", { token });
const usuarios = Array.isArray(lista.data) ? lista.data : [];
const sobras = usuarios.filter(
  (u) =>
    typeof u.email === "string" &&
    (u.email.startsWith("smoke.") || u.email.startsWith("repro."))
);

if (sobras.length === 0) {
  console.log("Nenhuma conta de teste sobrando. Banco limpo.");
} else {
  for (const u of sobras) {
    const d = await req("DELETE", `/api/admin/usuarios/${u.id}`, { token });
    console.log(`${d.status}  removido: ${u.email} (id ${u.id})`);
  }
  // relê para conferir
  const deNovo = await req("GET", "/api/admin/usuarios", { token });
  const resto = (Array.isArray(deNovo.data) ? deNovo.data : []).filter(
    (u) =>
      typeof u.email === "string" &&
      (u.email.startsWith("smoke.") || u.email.startsWith("repro."))
  );
  console.log(resto.length === 0 ? "OK: sem sobras." : `RESTAM: ${resto.length}`);
}
