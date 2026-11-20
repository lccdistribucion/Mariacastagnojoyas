/** Next llama a `register` una vez al arrancar el servidor: ahí se encienden las tareas automáticas. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.TAREAS_AUTOMATICAS === "0") return;
  const { iniciarTareas } = await import("./lib/tareas");
  iniciarTareas();
}
