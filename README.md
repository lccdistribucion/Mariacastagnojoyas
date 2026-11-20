# María Castagno · Sistema de gestión

Sistema web para la joyería María Castagno: stock de joyas, ventas, señas, pedidos a medida, reparaciones,
proveedores, tesorería, facturación ARCA y cotizaciones automáticas del dólar, el euro y el oro.
Funciona en la computadora, la tablet y el celular (diseñado primero para el mostrador).

> **Estado:** Módulos 1 (ingreso, roles y auditoría), 2 (cotizaciones automáticas) 3 (piezas y stock) y 4 (clientes, proveedores y compras) terminados y probados. Ver [`docs/ESTADO.md`](docs/ESTADO.md)
> y [`PENDIENTES.md`](PENDIENTES.md).

## Instalación (Windows)
1. Instalar **Node.js 22 o superior** desde https://nodejs.org (opción «LTS»).
2. Descomprimir esta carpeta, por ejemplo en `C:\MariaCastagno`.
3. Doble clic en **`INICIAR.bat`**. La primera vez instala y compila (unos minutos). Se abre el navegador solo.
4. Desde el celular o la tablet, conectados al **mismo wifi**, entrar a `http://IP-DE-LA-PC:3100`
   (la ventana negra muestra la dirección).

### Instalación manual (cualquier sistema)
```bash
npm install
npm run db:setup     # crea la base (data/maria-castagno.db) y los usuarios de prueba
npm run build
npm start            # http://localhost:3100
```

## Usuarios de prueba
| Usuario | Clave | Rol |
|---|---|---|
| `maria` | `Castagno2026` | Administradora |
| `lucia` | `Mostrador2026` | Usuario (vendedora) |

**Antes de cargar datos reales, cambiar estas claves** (en tu nombre, abajo a la izquierda → «Cambiar mi clave»).

## Cómo está hecho
- **Next.js 16 + React 19 + Tailwind 4**: una sola aplicación sirve las pantallas y la API REST (`/api/v1/...`).
- **SQLite** (archivo `data/maria-castagno.db`) con **Drizzle ORM**. No hace falta instalar un servidor de base de datos.
  Las migraciones (`drizzle/`) solo agregan; antes de aplicarlas se guarda una copia en `backups/`.
- Montos en **centavos enteros**, pesos de metal en **miligramos**, porcentajes en **centésimos** (sin errores de redondeo).
- Toda operación que toca varias tablas va en **una transacción** junto con su registro de **auditoría**.
- Nada se borra: se **desactiva** o se **anula**.

### Estructura
```
src/db/schema.ts          tablas
src/lib/                  reglas del negocio (sin pantallas): usuarios, permisos, config, auditoría, exportar
src/lib/auth/             claves, bloqueos, sesiones, autorización con clave de admin
src/app/(sistema)/        pantallas internas (requieren ingreso)
src/app/api/v1/           API REST
tests/unit/               pruebas de reglas (npm test)
tests/e2e/run.mjs         prueba completa en navegador, PC y celular (npm run test:e2e)
```

## Seguridad (Módulo 1)
- Claves con **bcrypt**; nunca se guardan ni se muestran (tampoco en la auditoría).
- **Bloqueo** tras 5 intentos fallidos por 15 minutos (configurable). Por equipo, el límite es el triple
  (una tablet compartida no se traba por los errores de una sola persona). El admin puede desbloquear.
- **Cierre por inactividad** (30 min por defecto): aviso 1 minuto antes con «Seguir conectada».
  Duración máxima de una sesión: 12 h. Desactivar un usuario o cambiarle la clave cierra sus sesiones.
- **Roles**: Administrador (todo) y Usuario (vendedor/a). El admin puede dar permisos puntuales a un usuario
  (ver/cargar ventas sin facturar, ver costos, ajustar stock, anular, ver ventas de todos…).
- **Autorización con clave del admin** (`src/lib/auth/autorizacion.ts`) para descuentos mayores al límite,
  anulaciones y ajustes: queda registrado quién autorizó a quién y para qué.
- **Auditoría** con filtros y exportación a **Excel y PDF**.

## API REST (v1)
Usa la misma sesión (cookie) que las pantallas. 401 = sin sesión; 403 = sin permiso.
| Método | Ruta | Permiso |
|---|---|---|
| POST / DELETE | `/api/v1/sesion` (`{usuario, clave}`) | — |
| GET | `/api/v1/yo` | sesión |
| POST | `/api/v1/sesion/latido` | sesión |
| GET | `/api/v1/usuarios` | gestionar_usuarios |
| GET | `/api/v1/auditoria?desde=aaaa-mm-dd&hasta=&usuarioId=&accion=&entidad=&texto=&pagina=` | ver_auditoria |
| GET | `/api/v1/cotizaciones` (vigentes + gramo por ley) | sesión |
| GET | `/api/v1/cotizaciones/historial?codigo=USD_BLUE&dias=30` | sesión |
| POST | `/api/v1/cotizaciones/actualizar` | modificar_cotizaciones |

## Cotizaciones automáticas (Módulo 2)
Se actualizan solas mientras el sistema está abierto: en horario comercial cada 30 minutos y fuera de horario cada
3 horas (configurable en **Configuración → Cotizaciones y leyes**). La barra superior muestra dólar (con selector
de tipo), euro, onza de oro y el gramo de oro 24k, 18k y bajo, cada uno con su semáforo:
**verde** al día · **amarillo** desactualizada · **rojo** falló y se usa el último valor · **champagne** propia del negocio.

### Fuentes (todas gratuitas y sin clave; probadas el 17/11/2026)
| Fuente | Qué da | Límites | Rol por defecto |
|---|---|---|---|
| DolarApi (dolarapi.com) | Dólar oficial, blue, MEP, CCL, tarjeta, mayorista; euro oficial | Sin límite publicado | Principal (monedas) |
| CriptoYa (criptoya.com) | Dólar oficial, blue, MEP, CCL, tarjeta, mayorista | Sin límite publicado | Respaldo 1 |
| Bluelytics (bluelytics.com.ar) | Dólar y euro, oficial y blue | Sin límite publicado | Respaldo 2 / euro blue |
| Gold API (gold-api.com) | Onza de oro y plata (spot, casi en tiempo real) | Sin clave ni límite publicado | Principal (metales) |
| BCRA (api.bcra.gob.ar) | Dólar de referencia A3500, onza de oro y plata (cierre diario) | Oficial, un valor por día hábil | Respaldo de metales |
| ArgentinaDatos (argentinadatos.com) | **Solo historial** diario de blue, oficial, MEP y tarjeta | — | Historial |

Cada fuente es un **conector** en `src/lib/cotizaciones/conectores/`. Para cambiar de proveedor se escribe un conector
y se lo registra en `registro.ts`; el orden y cuáles están activas se eligen desde Configuración.
Para cada cotización se usa la primera fuente que la entregue con un valor razonable; si responde un respaldo
llega un **aviso** al administrador; si no responde ninguna, se mantiene el último valor (en rojo) y también avisa.
Las ventas nunca se frenan por esto.

### Cálculo del oro
`gramo = onza ÷ 31,1035 × (milésimos ÷ 1000) × dólar de referencia (venta)`. Leyes configurables (24k, 18k, 14k,
10k «oro bajo», 9k, plata 925 y las que se agreguen), cada una con su ajuste de **venta** y de **compra de usado**.
Metales sin cotización: precio manual del gramo.

### Otras funciones
- «Actualizar ahora», carga manual y **cotización propia del negocio** (manda sobre la automática hasta quitarla).
- Aviso si el dólar de referencia o el oro varían más de 3 % en el día (configurable).
- Historial con gráficos (7 días a 1 año) y exportación a Excel/PDF. Al arrancar por primera vez trae solo el
  último año desde el BCRA y ArgentinaDatos (`npm run cotizaciones:historial -- 730` para más).
- `fotoCotizaciones()` (`src/lib/cotizaciones/vigentes.ts`): la usarán ventas, compras y canjes para guardar la
  cotización del momento.
- `npm run cotizaciones:probar`: consulta cada fuente real y muestra qué devuelve (no guarda nada).
- Si la red del local usa un proxy, agregar `NODE_USE_ENV_PROXY=1` en `.env.local`.

### Copia de seguridad diaria
A la hora configurada (21:00 por defecto; si la PC estaba apagada, al encenderla) se guarda una copia en `backups/`
y, si se configuró, también en una carpeta adicional (por ejemplo, la de Google Drive para PC). Se conservan las
últimas 30 diarias; las manuales y las de antes de migrar no se tocan.

## Piezas y stock (Módulo 3)
- **Ficha de cada pieza**: código interno único y código de barras (automático por categoría: ANI-0001…), tipo
  (pieza única, por cantidad, insumo, packaging), categoría, colección, diseñador/artesano, metal y ley, pesos bruto y
  neto, medidas, talle, piedras (tipo, cantidad, quilates, calidad, certificado), fotos, descripción y notas internas,
  costo con desglose y moneda, precio de lista y de oferta, IVA, origen (compra, consignación, fabricación, canje,
  inventario inicial), ubicación y estado.
- **Precio fijo o por gramo**: por gramo = peso neto × precio de venta del gramo de la ley + hechura; se actualiza
  solo con la cotización. Precio fijo en pesos, dólares o euros (pasado a pesos con la cotización del día).
- **Fotos** (hasta 12 por pieza): se comprimen solas a WebP (1600 px + miniatura de 400 px) en `data/fotos/`.
- **Movimientos con trazabilidad**: alta, ajustes con motivo obligatorio (con permiso o con la clave de un
  administrador en el momento), cambios de estado y ubicación, piezas fuera del local (ferias, pruebas de clientes)
  con fecha de devolución, historial de precios. Nada se borra: una pieza perdida o rota se da de baja.
- **Inventario físico**: lector de códigos USB/Bluetooth, cámara del celular (Chrome en Android) o tipeo; al cerrar
  muestra faltantes, sobrantes y diferencias de cantidad. Cerrar no cambia el stock: los ajustes se hacen aparte.
- **Avisos** (en Avisos, una vez por día): stock bajo, piezas fuera del local atrasadas y, los lunes, piezas sin
  movimiento hace X meses.
- **Importación** desde Excel/CSV con plantilla, validación fila por fila y carga de todas las válidas juntas.
- **Actualización masiva de precios** por porcentaje (por categoría, ley, artesano o moneda), con vista previa,
  redondeo y referencia de cuánto varió el oro en 30 días. Las piezas por gramo no se tocan (se actualizan solas).
- **Listas de precios** (contado, tarjeta, mayorista) como recargo/descuento sobre el precio de cada pieza.
- **Etiquetas en PDF** con Code 128 y QR: colgante «colita» 70 × 12 mm, adhesiva 40 × 25 mm u hoja A4 de 24.
- **Valuación del stock** a costo y a precio de hoy (solo con permiso de ver costos); lo consignado no suma como propio.
- **Piezas de ejemplo**: el sistema trae 13 para probar; se quitan en Configuración → Stock y etiquetas.

API: `GET /api/v1/productos` (con filtros), `GET /api/v1/productos/buscar?codigo=`, `POST /api/v1/productos/:id/fotos`.

## Clientes, proveedores y compras (Módulo 4)
- **Clientes**: alta rápida desde el mostrador (solo el nombre es obligatorio), DNI/CUIT validados (dígito verificador)
  y sin documentos repetidos, aviso de posibles duplicados (mismo nombre o WhatsApp), WhatsApp normalizado
  (+549…), cumpleaños, aniversario, talles, preferencias, lista de deseos y cuenta corriente (saldo inicial y
  ajustes solo el administrador; ventas y cobros llegan con el módulo 5).
- **Recordatorios**: cumpleaños y aniversarios de los próximos 30 días y saldos pendientes, con el mensaje de
  WhatsApp ya escrito (plantillas en Configuración → Mensajes a clientes). Nada se envía solo.
- **Proveedores**: razón social, CUIT validado y único, condición de IVA, rubros (fabricante, mayorista, artesano,
  fundidor, taller, piedras, insumos, relojes, revendedor), contacto y condiciones de pago. Solo los ve quien tiene
  el permiso «Ver proveedores y compras».
- **Compras**: factura A/B/C, interno o remito, en pesos, dólares o euros con su tipo de cambio, IVA (discriminado
  en A), percepciones. Ítems: pieza nueva (se da de alta en el stock con su costo y proveedor), unidades de un
  artículo existente (suma stock y actualiza el costo) o metal por gramo (va al metal propio). Contado (queda pagada)
  o cuenta corriente (con vencimiento según los días de pago). Anular revierte todo si las piezas no se movieron.
- **Cuenta corriente de proveedores por moneda**, pagos con imputación a facturas (pagos parciales), saldo inicial,
  notas de crédito y ajustes. En el módulo 6 los pagos se vinculan con las cajas.
- **Consignación recibida** (piezas de terceros: deuda recién al venderse, devolución al dueño) y **entregada**
  (piezas nuestras a revendedores: vendida → nos debe el precio acordado; devuelta → vuelve al stock).
- **Metal propio** (Stock → Metal propio): gramos por ley valuados a la cotización de hoy.
- **Sugerencia de reposición** por proveedor (artículos por debajo del mínimo).

API: `GET /api/v1/clientes`, `GET /api/v1/proveedores`.

## Ventas, señas, pedidos a medida y reparaciones (Módulo 5)
- **Mostrador** (`/mostrador`): se escanea el código (el lector escribe y da Enter: va directo a la venta) o se busca
  por nombre; la ficha grande de la pieza sirve para mostrarla al cliente. Cliente existente o alta rápida (o
  consumidor final), lista de precios y descuento. **Los precios los calcula siempre el servidor** con la cotización
  del momento; cambiarlos requiere el permiso «Modificar precios». Un descuento mayor al tope pide usuario y clave de
  un administrador (queda registrado quién autorizó).
- **Cobro en varios medios** en la misma venta: efectivo (con cálculo del vuelto), dólares/euros (al dólar de
  referencia de compra o al cambio que se escriba), transferencia, QR, débito, crédito en cuotas, gift card/vale,
  saldo a favor o seña y cuenta corriente (en un vencimiento o en plan de cuotas mensuales). Cada medio y cada plan de
  cuotas puede tener recargo o descuento (Configuración → Ventas y cobros; arrancan en 0 %).
- **Canje de metal**: el oro/plata que entrega el cliente se descuenta al precio de compra del gramo; va al metal
  propio o entra como pieza usada. Exige cliente con DNI o CUIT.
- **Gift cards** (se venden en el mostrador) y **vales de cambio** (salen de las devoluciones), con código, saldo y
  vencimiento (Ventas → Gift cards y vales).
- **Presupuestos** con validez (respetan el precio del día hasta la fecha; vencidos se recalculan) y **reservas** con
  o sin seña (precio congelado o del día; vencen solas, la pieza se libera y la seña queda a favor del cliente).
- **Comprobantes en PDF**: comprobante de venta («documento no válido como factura» hasta el módulo 7), remito,
  certificado de garantía con foto y piedras, presupuesto, recepción de reparación y orden de pedido. Botón de
  WhatsApp con el mensaje listo (se adjunta el PDF descargado).
- **Devoluciones y cambios** (vale, saldo a favor o reintegro; la pieza vuelve al stock) y **anulación** de ventas
  (revierte stock, cobros, cuenta corriente, gift cards, canjes y deuda de consignación). Requieren el permiso
  «Anular comprobantes».
- **Comisiones** por vendedor (el porcentaje se define en Usuarios).
- **Taller**: reparaciones con número, fotos de cómo llega (cámara del celular), trabajos, peso, presupuesto, fecha
  prometida, seña, envío a un taller externo (su costo va a la cuenta corriente del proveedor), aviso por WhatsApp y
  entrega cobrando desde el mostrador. **Pedidos a medida** con precio pactado o a la cotización del día de entrega
  (gramos finales × gramo + hechura), seña y pagos a cuenta, metal entregado/devuelto al taller y merma.
- **Ficha del cliente**: historial de compras, reparaciones y pedidos, garantías vigentes, señas en curso y cobro de
  la cuenta corriente.
- **Avisos automáticos** (todos los días): reservas vencidas, reparaciones atrasadas o sin retirar, pedidos atrasados.

API: `GET /api/v1/ventas` (respeta los permisos), `POST /api/v1/taller/{reparacion|pedido}/:id/fotos`,
PDF en `/documentos/{comprobante|remito|garantia|presupuesto|reparacion|pedido}/:id`.

## Tesorería (Módulo 6)
- **Cajas y cuentas**, cada una en su moneda: efectivo en pesos, dólares y euros, bancos (pesos y dólares),
  billeteras (Mercado Pago), «Tarjetas a acreditar» y «Cheques en cartera». Saldo en su moneda y su equivalente en
  pesos (dólar de referencia a la compra / euro oficial). Se renombran, agregan o desactivan en Tesorería → Cajas, y
  ahí se carga el **saldo inicial** de cada una.
- **Todo cobro entra solo en su caja**: cada medio de cobro tiene su caja (Configuración → Ventas y cobros). Ventas,
  señas y cobros de cuenta corriente; al anular una venta, sale.
- **Tarjetas**: los cobros con débito y crédito (con sus cuotas) quedan a acreditar con fecha esperada. Al llegar la
  liquidación se marcan los cupones y se carga el neto y las retenciones: el neto pasa al banco y la comisión y las
  retenciones quedan como gastos. Fecha esperada vs. real y aviso si se atrasa.
- **Pagos a proveedores** desde una caja (efectivo, transferencia), endosando un cheque de la cartera, con cheque
  propio (se debita del banco el día de pago) o **en metal** (gramos de una ley que salen del metal propio). En
  pesos o en dólares. Anular el pago devuelve todo (dinero, cheque o metal).
- **Gastos e ingresos varios** con categorías (alquiler, sueldos, servicios, impuestos, publicidad, seguros,
  packaging, comisiones…), **transferencias** entre cajas y **compra/venta de divisas** con el tipo de cambio de la
  operación. El efectivo no puede quedar en negativo.
- **Caja del día** (todos los usuarios): apertura y cierre de cada caja de efectivo con arqueo. La vendedora cuenta
  sin ver lo esperado; la diferencia queda registrada como movimiento y le llega un aviso al administrador.
- **Cheques**: de terceros recibidos (de un cliente, que paga su cuenta corriente, o como otro ingreso), depositados,
  endosados y rechazados (la deuda vuelve a quien lo entregó); propios emitidos con fecha de pago y débito.
- **Conciliación bancaria**: se sube el extracto (Excel o CSV), el sistema propone las coincidencias (mismo importe,
  fecha cercana), se confirman, y lo que está en el banco y no en el sistema (comisiones, impuestos) se registra con
  un clic.
- **Flujo de fondos** por semana o por mes: tarjetas a acreditar, cheques, cuotas de clientes y facturas de
  proveedores pendientes, con el saldo proyectado.
- **Devoluciones con reintegro** y **devolución de saldo a favor** a un cliente (por ejemplo, una seña): salen de la
  caja elegida.
- Avisos diarios: cajas que quedaron sin cerrar, tarjetas atrasadas y cheques por depositar o debitar.

Permiso: «Ver tesorería general» (solo el administrador). «Caja del día» la usan todos.
API: `GET /api/v1/tesoreria/cajas`.

## Facturación electrónica y ventas sin facturar (Módulo 7)
- **Factura A, B o C con CAE** de ARCA (web service WSFEv1), según la condición del negocio (Responsable inscripto:
  A a inscriptos con CUIT, B al resto; Monotributo: C) y la del cliente. Se pide el CAE al confirmar la venta en el
  mostrador; si ARCA no responde, la venta queda registrada y la factura **pendiente** (se reintenta sola todos los
  días y desde Facturación → Pendientes). Los **rechazos** quedan con el motivo para corregir y reintentar.
- **Numeración controlada por ARCA** (último autorizado + 1), de a una emisión por vez. Si se pierde la respuesta,
  al reintentar se consulta el comprobante en ARCA antes de pedir otro número (no se duplica).
- **Notas de crédito**: automáticas en las devoluciones de ventas facturadas (por lo devuelto) y para anular una venta
  facturada (por el total; cuando ARCA la autoriza se anula la venta). **Notas de débito** manuales a un cliente
  (suman a su cuenta corriente).
- **PDF** con letra, código, datos fiscales, CAE y **QR de ARCA**; en la factura B, el IVA contenido (Ley 27.743).
  Si la venta se pagó en dólares o euros, la factura (en pesos) indica el tipo de cambio.
- **Tratamiento de IVA por pieza**: general, **bien usado** (IVA solo sobre la diferencia con el costo; las piezas
  que entran por canje quedan así) o exento. A validar con el contador.
- **Ventas sin facturar**: comprobante interno, solo con permiso; mueven stock y caja igual. Informe separado y
  consolidado, y **«Facturar ahora»** (a posteriori) sin volver a mover stock ni caja.
- **Libros IVA Ventas y Compras** por mes, en Excel.
- **Configuración ARCA**: datos fiscales, puntos de venta, ambiente (simulado / homologación / producción) y
  **certificados**: el sistema genera la clave y el pedido (.csr), se sube en ARCA y se carga el certificado que
  devuelve; botón «Probar conexión». La clave privada queda solo en `data/arca/` de la computadora del local.
- Modo **simulado** (por defecto): todo el circuito funciona con comprobantes marcados «sin validez fiscal», para
  probar antes de tener el certificado.

## Pruebas
```bash
npm test            # 102 pruebas de reglas (seguridad, cotizaciones, oro, stock, clientes, compras, ventas, cobros, taller, tesorería, facturación…)
npm run test:e2e    # recorrido completo en navegador real, computadora y celular, con capturas
```
