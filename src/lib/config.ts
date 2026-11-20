/**
 * Configuración general del negocio. Cada clave tiene un valor por defecto y una validación;
 * se guarda como JSON en la tabla `configuracion` y cada cambio queda en auditoría.
 */
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { configuracion, db, type Tx } from "@/db";
import { auditar, type Actor } from "./auditoria";
import { DOLARES_REFERENCIA } from "./cotizaciones/tipos";

const hora = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora en formato 24 h, por ejemplo 09:30");

export const CONFIG = {
  "negocio.nombre": { etiqueta: "Nombre del negocio", tipo: z.string().min(1).max(80), defecto: "María Castagno" },
  "seguridad.intentos_max": {
    etiqueta: "Intentos fallidos antes de bloquear",
    tipo: z.number().int().min(3).max(20),
    defecto: 5,
  },
  "seguridad.bloqueo_minutos": {
    etiqueta: "Minutos de bloqueo",
    tipo: z.number().int().min(1).max(1440),
    defecto: 15,
  },
  "seguridad.inactividad_minutos": {
    etiqueta: "Cerrar sesión tras minutos sin uso",
    tipo: z.number().int().min(2).max(480),
    defecto: 30,
  },
  "seguridad.sesion_horas": {
    etiqueta: "Duración máxima de una sesión (horas)",
    tipo: z.number().int().min(1).max(72),
    defecto: 12,
  },
  "ventas.descuento_max_pct": {
    etiqueta: "Descuento máximo sin autorización (%)",
    // centésimos de punto: 1000 = 10 %
    tipo: z.number().int().min(0).max(10000),
    defecto: 1000,
  },
  "cotizaciones.dolar_referencia": {
    etiqueta: "Dólar de referencia del negocio",
    tipo: z.enum(DOLARES_REFERENCIA),
    defecto: "USD_BLUE" as (typeof DOLARES_REFERENCIA)[number],
  },
  "cotizaciones.frecuencia_minutos": {
    etiqueta: "Actualizar cotizaciones cada (minutos, en horario comercial)",
    tipo: z.number().int().min(15).max(240),
    defecto: 30,
  },
  "cotizaciones.frecuencia_fuera_horario": {
    etiqueta: "Actualizar fuera de horario cada (minutos)",
    tipo: z.number().int().min(60).max(1440),
    defecto: 180,
  },
  "cotizaciones.horario_desde": { etiqueta: "Horario comercial desde", tipo: hora, defecto: "09:00" },
  "cotizaciones.horario_hasta": { etiqueta: "Horario comercial hasta", tipo: hora, defecto: "20:00" },
  "cotizaciones.dias": {
    etiqueta: "Días comerciales",
    // 1 = lunes … 7 = domingo
    tipo: z.array(z.number().int().min(1).max(7)).min(1),
    defecto: [1, 2, 3, 4, 5, 6] as number[],
  },
  "cotizaciones.alerta_variacion_pct": {
    etiqueta: "Avisar si el dólar o el oro varían más de (%) en el día",
    tipo: z.number().int().min(50).max(5000),
    defecto: 300,
  },
  "cotizaciones.conectores": {
    etiqueta: "Fuentes de cotización (orden y activas)",
    tipo: z.array(z.object({ id: z.string(), activo: z.boolean() })),
    defecto: [
      { id: "dolarapi", activo: true },
      { id: "criptoya", activo: true },
      { id: "bluelytics", activo: true },
      { id: "goldapi", activo: true },
      { id: "bcra", activo: true },
    ] as { id: string; activo: boolean }[],
  },
  "cotizaciones.ley_oro_bajo": { etiqueta: "Ley que se muestra como «oro bajo»", tipo: z.number().int().min(0), defecto: 0 },
  "stock.permitir_negativo": {
    etiqueta: "Permitir stock negativo en artículos por cantidad",
    tipo: z.boolean(),
    defecto: false as boolean,
  },
  "stock.meses_sin_movimiento": {
    etiqueta: "Avisar piezas sin movimiento hace (meses)",
    tipo: z.number().int().min(1).max(60),
    defecto: 6,
  },
  "etiquetas.formato": {
    etiqueta: "Formato de etiqueta",
    tipo: z.enum(["colita", "adhesiva", "a4"]),
    defecto: "colita" as "colita" | "adhesiva" | "a4",
  },
  "etiquetas.con_precio": { etiqueta: "Imprimir el precio en la etiqueta", tipo: z.boolean(), defecto: true as boolean },
  "demo.cargado": { etiqueta: "Datos de ejemplo cargados", tipo: z.boolean(), defecto: false as boolean },
  "demo.cargado_m4": { etiqueta: "Clientes y proveedores de ejemplo cargados", tipo: z.boolean(), defecto: false as boolean },
  "demo.cargado_m5": { etiqueta: "Reparaciones y pedidos de ejemplo cargados", tipo: z.boolean(), defecto: false as boolean },
  "mensajes.cumpleanos": {
    etiqueta: "Mensaje de cumpleaños",
    tipo: z.string().min(5).max(500),
    defecto: "¡Feliz cumpleaños, {nombre}! 🎉 Te saludamos con mucho cariño desde María Castagno.",
  },
  "mensajes.aniversario": {
    etiqueta: "Mensaje de aniversario",
    tipo: z.string().min(5).max(500),
    defecto: "¡Feliz aniversario, {nombre}! Que lo celebren con mucho amor. Un saludo de María Castagno.",
  },
  "mensajes.saldo": {
    etiqueta: "Mensaje de saldo pendiente",
    tipo: z.string().min(5).max(500),
    defecto: "Hola {nombre}, te escribimos de María Castagno. Te recordamos que tenés un saldo pendiente de {saldo}. Cualquier consulta, avisanos. ¡Gracias!",
  },
  "negocio.direccion": { etiqueta: "Dirección del local (comprobantes)", tipo: z.string().max(150), defecto: "" },
  // Módulo 7: facturación electrónica (valores a confirmar con el contador)
  "fiscal.condicion_iva": { etiqueta: "Condición frente al IVA del negocio", tipo: z.enum(["responsable_inscripto", "monotributo"]), defecto: "responsable_inscripto" as "responsable_inscripto" | "monotributo" },
  "fiscal.razon_social": { etiqueta: "Razón social (facturas)", tipo: z.string().max(120), defecto: "" },
  "fiscal.iibb": { etiqueta: "Ingresos Brutos N.º (facturas)", tipo: z.string().max(30), defecto: "" },
  "fiscal.inicio_actividades": { etiqueta: "Inicio de actividades (facturas)", tipo: z.string().max(10), defecto: "" },
  "fiscal.tope_sin_identificar": {
    etiqueta: "Factura B a consumidor final: desde este importe hay que identificar al comprador ($)",
    // centavos. Valor de referencia de ARCA a validar con el contador (cambia por resolución).
    tipo: z.number().int().min(0),
    defecto: 1_000_000_000,
  },
  "fiscal.emitir_al_vender": { etiqueta: "Pedir el CAE apenas se confirma la venta", tipo: z.boolean(), defecto: true as boolean },
  "arca.ambiente": { etiqueta: "Conexión con ARCA", tipo: z.enum(["simulado", "homologacion", "produccion"]), defecto: "simulado" as "simulado" | "homologacion" | "produccion" },
  "negocio.telefono": { etiqueta: "Teléfono / WhatsApp del local (comprobantes)", tipo: z.string().max(60), defecto: "" },
  "negocio.cuit": { etiqueta: "CUIT del negocio (comprobantes)", tipo: z.string().max(20), defecto: "" },
  "negocio.web": { etiqueta: "Web o Instagram (comprobantes)", tipo: z.string().max(100), defecto: "mariacastagnojoyas.com" },
  "ventas.garantia_meses": { etiqueta: "Garantía de las piezas vendidas (meses)", tipo: z.number().int().min(0).max(120), defecto: 12 },
  "ventas.garantia_texto": {
    etiqueta: "Texto de la garantía (certificado)",
    tipo: z.string().max(600),
    defecto: "Garantía por defectos de fabricación. No cubre golpes, roturas por uso indebido ni la pérdida de piedras por impactos.",
  },
  "ventas.vale_meses": { etiqueta: "Vigencia de vales y gift cards (meses)", tipo: z.number().int().min(1).max(60), defecto: 12 },
  "reservas.dias": { etiqueta: "Días de reserva por defecto", tipo: z.number().int().min(1).max(180), defecto: 7 },
  "presupuestos.validez_dias": { etiqueta: "Validez de los presupuestos (días)", tipo: z.number().int().min(1).max(90), defecto: 7 },
  "reparaciones.dias_abandono": { etiqueta: "Avisar reparaciones no retiradas después de (días)", tipo: z.number().int().min(7).max(720), defecto: 60 },
  "reparaciones.condiciones": {
    etiqueta: "Texto al pie del comprobante de reparación",
    tipo: z.string().max(800),
    defecto: "Conservá este comprobante: se pide para retirar la pieza. Si al revisarla aparece otro arreglo necesario, te avisamos antes de hacerlo.",
  },
  "mensajes.reparacion_lista": { etiqueta: "Mensaje: reparación lista", tipo: z.string().min(5).max(500), defecto: "Hola {nombre}, tu {pieza} ya está lista para retirar en María Castagno. ¡Te esperamos!" },
  "mensajes.pedido_listo": { etiqueta: "Mensaje: pedido a medida listo", tipo: z.string().min(5).max(500), defecto: "Hola {nombre}, ¡tu pedido ya está listo! Podés pasar a retirarlo por María Castagno." },
  "mensajes.comprobante": { etiqueta: "Mensaje: comprobante de compra", tipo: z.string().min(5).max(500), defecto: "Hola {nombre}, ¡gracias por tu compra en María Castagno! Te envío el comprobante {numero}." },
  "backup.hora": { etiqueta: "Hora de la copia de seguridad diaria", tipo: hora, defecto: "21:00" },
  "backup.conservar": { etiqueta: "Copias diarias a conservar", tipo: z.number().int().min(7).max(365), defecto: 30 },
  "backup.carpeta_extra": {
    etiqueta: "Carpeta adicional para las copias (por ejemplo, una carpeta de Google Drive)",
    tipo: z.string().max(300),
    defecto: "",
  },
} as const;

export type ClaveConfig = keyof typeof CONFIG;
export type ValorConfig<K extends ClaveConfig> = z.infer<(typeof CONFIG)[K]["tipo"]>;

/** Lee una o varias claves (con su valor por defecto si nunca se guardaron). */
export async function leerConfig<K extends ClaveConfig>(claves: K[], tx: Tx = db): Promise<{ [P in K]: ValorConfig<P> }> {
  const filas = await tx.select().from(configuracion).where(inArray(configuracion.clave, claves));
  const out = {} as Record<string, unknown>;
  for (const k of claves) {
    const fila = filas.find((f) => f.clave === k);
    let valor: unknown = structuredClone(CONFIG[k].defecto);
    if (fila) {
      const r = CONFIG[k].tipo.safeParse(JSON.parse(fila.valor));
      if (r.success) valor = r.data;
    }
    out[k] = valor;
  }
  return out as { [P in K]: ValorConfig<P> };
}

export async function leerUna<K extends ClaveConfig>(clave: K, tx: Tx = db): Promise<ValorConfig<K>> {
  return (await leerConfig([clave], tx))[clave];
}

/** Guarda varias claves juntas (en una transacción) y deja el antes/después en auditoría. */
export async function guardarConfig(valores: Partial<Record<ClaveConfig, unknown>>, actor: Actor) {
  const claves = Object.keys(valores) as ClaveConfig[];
  const validados: Record<string, unknown> = {};
  for (const k of claves) {
    if (!(k in CONFIG)) throw new Error(`Clave de configuración desconocida: ${k}`);
    const r = CONFIG[k].tipo.safeParse(valores[k]);
    if (!r.success) throw new ErrorValidacion(`«${CONFIG[k].etiqueta}» no es válido${r.error.issues[0]?.message && !/^(Invalid|Too|Expected)/.test(r.error.issues[0].message) ? `: ${r.error.issues[0].message}` : "."}`);
    validados[k] = r.data;
  }
  await db.transaction(async (tx) => {
    const actuales = await leerConfig(claves, tx);
    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    for (const k of claves) {
      if (JSON.stringify(actuales[k]) === JSON.stringify(validados[k])) continue;
      // Los porcentajes se guardan en centésimos (1000 = 10 %): en la auditoría se muestran como %.
      const ver = (v: unknown) => (k.endsWith("_pct") && typeof v === "number" ? `${String(v / 100).replace(".", ",")} %` : v);
      antes[CONFIG[k].etiqueta] = ver(actuales[k]);
      despues[CONFIG[k].etiqueta] = ver(validados[k]);
      const valor = JSON.stringify(validados[k]);
      const existe = await tx.select({ c: configuracion.clave }).from(configuracion).where(eq(configuracion.clave, k));
      if (existe.length)
        await tx
          .update(configuracion)
          .set({ valor, actualizadoEn: new Date(), actualizadoPor: actor.id })
          .where(eq(configuracion.clave, k));
      else await tx.insert(configuracion).values({ clave: k, valor, actualizadoPor: actor.id });
    }
    if (Object.keys(despues).length)
      await auditar(tx, actor, {
        accion: "modificacion",
        entidad: "configuracion",
        descripcion: `Cambió la configuración: ${Object.keys(despues).join(", ").toLowerCase()}`,
        antes,
        despues,
      });
  });
}

/** Error con un mensaje pensado para mostrarle a la persona (no técnico). */
export class ErrorValidacion extends Error {}
