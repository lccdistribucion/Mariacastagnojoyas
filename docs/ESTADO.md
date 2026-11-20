# Estado del proyecto — memoria para cualquier sesión
Al día: 18/11/2026 (módulo 4). Si algo cambia, se actualiza acá; lo que falta va en [`PENDIENTES.md`](../PENDIENTES.md).

## Reglas con la dueña / el dueño
- **Este proyecto NO va en el repositorio de LCC Distribuidora** (pedido explícito, 17/11/2026). No hay repositorio:
  se entrega como carpeta comprimida (.zip) al terminar cada módulo.
- Consultar dudas que cambien el resultado; no generar costos ni activar APIs pagas sin autorización.
- Mostrar capturas en computadora **y celular (390 px)** al terminar cada etapa.
- Desarrollo módulo por módulo; esperar el OK antes de pasar al siguiente.

## Decisiones tomadas (17/11/2026, aceptadas: «aceptar todo lo que me digas»)
- Stack: Next.js 16.4.6 + React 19 + Tailwind 4 + SQLite/Drizzle. Corre en la PC del local (gratis); celulares por wifi.
- Estética: blanco y negro como la marca (logo manuscrito tomado de mariacastagnojoyas.com, tipografía Montserrat),
  papel marfil, títulos en Cormorant Garamond, acento champagne puntual.
- Dólar de referencia por defecto: **blue** (configurable en el módulo 2). Oro bajo por defecto: **10k** (configurable).
- Bloqueo: 5 intentos / 15 min por usuario; 15 intentos por equipo. Inactividad 30 min. Sesión máx. 12 h.
- Descuento máximo general sin autorización: 10 % (configurable, y por usuario).
- Vendedores sin permisos especiales por defecto; el admin concede puntualmente (lista en `src/lib/permisos.ts`).

## Módulo 1 — terminado (17/11/2026)
Pantallas: `/ingresar`, `/cambiar-clave`, `/` (Inicio), `/usuarios` (+ `nuevo`, `[id]`), `/auditoria`
(+ `exportar?formato=xlsx|pdf`), `/configuracion` (+ copia de seguridad), `/sin-permiso`.
Pruebas: 17 de reglas + 14 pasos en navegador (PC 1440 px y celular 390 px), todas en verde.

## Módulo 2 — terminado (17/11/2026)
- Conectores: dolarapi → criptoya → bluelytics (monedas), goldapi → bcra (metales). BCRA y ArgentinaDatos para historial.
- Tareas automáticas DENTRO del servidor (`src/instrumentation.ts` → `src/lib/tareas.ts`), en vez de un proceso aparte:
  así no hay que abrir otra ventana. Un fallo en una tarea genera un aviso y no frena nada.
- Pantallas: barra superior real (todas), `/cotizaciones` (todas; admin además actualizar/carga manual/registro),
  `/configuracion/cotizaciones` (parámetros, leyes, fuentes, historial), `/alertas` (admin).
- Seguridad de datos: carga manual con freno si difiere >30 % (error de tipeo); «1.560» se lee como mil quinientos sesenta.
- Pruebas: 32 de reglas + 24 pasos en navegador (PC y celular). Las pruebas usan fuentes SIMULADAS
  (`COTIZACIONES_SIMULADAS=1`) y carpeta de copias temporal: nunca tocan las copias reales.
- Ajustes de venta/compra de las leyes arrancan en 0 %: los define la dueña.

## Módulo 3 — terminado (18/11/2026)
- Pantallas: `/stock` (listado con fotos, filtros, valuación), `/stock/nueva`, `/stock/[id]` (ficha, fotos, acciones,
  historial), `/stock/[id]/editar`, `/stock/salidas`, `/stock/inventario` (+ `[id]` con lector), `/stock/precios`
  (masivo), `/stock/importar`, `/stock/etiquetas` (+ `pdf`), `/configuracion/stock`.
- Decisiones: artesano y consignante son texto libre hasta el módulo 4 (Proveedores), donde se vinculan.
  Cargar/editar piezas = permiso «cargar_productos» (delegable); cambiar el precio de una pieza ya cargada =
  «modificar_precios» (admin); quien no ve costos no los puede pisar al editar. Las listas de precios arrancan en 0 %.
- Formularios largos no se vacían si hay un error (`src/components/envio.ts`).
- Piezas de ejemplo (13, `es_demo`), se cargan una vez (`demo.cargado`) y se quitan desde Configuración.
- Pruebas: 48 de reglas + 35 pasos en navegador.

## Módulo 4 — terminado (18/11/2026)
- Pantallas: `/clientes` (+ `nuevo`, `[id]`, `[id]/editar`, `recordatorios`), `/proveedores` (+ `nuevo`, `[id]`,
  `[id]/editar`, `compras`, `compras/nueva`, `compras/[id]`, `consignaciones`, `reposicion`), `/stock/metal`,
  `/configuracion/mensajes`.
- Decisiones: pagos a proveedores ya en este módulo (sin caja; el módulo 6 los vincula). Los «terceros» (revendedores)
  son proveedores con rubro «revendedor»; la cuenta corriente usa el mismo libro (positivo = le debemos; negativo =
  nos debe). Pieza nueva comprada: el costo va a «otros» (se puede desglosar después). Unidades de un artículo:
  el costo nuevo se reparte con las proporciones del anterior. IVA solo se discrimina en facturas A.
- Vendedora: da de alta clientes y ve su saldo; no ve proveedores (ni el nombre en la ficha de la pieza), ni saldos
  de todos los clientes, ni carga saldos.
- Corregido en este módulo (también afectaba al 3): subconsultas que comparaban con «id» sin tabla
  (saldo de clientes, pendientes de compras y aviso de piezas sin movimiento).
- Datos de ejemplo: 4 clientes y 4 proveedores (además de las 13 piezas); se quitan todos juntos.
- Pruebas: 62 de reglas + 45 pasos en navegador.

## Módulo 5 — terminado (18/11/2026, aprobado)
- Pantallas: `/mostrador`, `/ventas` (+ `[id]`, `presupuestos`, `reservas`, `vales`, `comisiones`), `/taller`
  (+ `nueva`, `[id]`, `pedidos`, `pedidos/nuevo`, `pedidos/[id]`), `/configuracion/ventas`; ficha del cliente con
  historial, garantías, señas y cobro; botón «Vender» en la ficha de la pieza; Inicio con resumen del día.
- Lógica en `src/lib/ventas/*` (motor, cobros, medios, vales, presupuestos, reservas, consultas, demo) y
  `src/lib/taller/*`; PDF en `src/lib/documentos/*`. Migración `drizzle/0004_modulo5_ventas.sql` (solo agrega).
- Decisiones: el precio lo calcula siempre el servidor (la pantalla solo muestra); el tope de descuento es el del
  usuario o el general (el admin no tiene tope); las señas quedan como saldo a favor del cliente y se atan a su
  operación (`reserva:ID`, `pedido:ID`, `reparacion:ID`) para que no las «coma» otra deuda; las divisas se reciben al
  dólar de referencia de COMPRA; el canje exige DNI/CUIT; anular y devolver requieren «Anular comprobantes»; una venta
  con factura electrónica emitida no se anula (nota de crédito, módulo 7). Packaging e insumos no se venden en el mostrador.
- Datos de ejemplo: 2 reparaciones y 1 pedido. «Quitar los datos de ejemplo» borra también las ventas de prueba
  (con piezas o clientes de ejemplo); si una venta mezcla piezas reales y de ejemplo, pide anularla antes.
- Estilos: `.campo` pasó a `@layer components` para que las clases de tamaño (w-16, h-9…) funcionen sobre los campos.
- Pruebas: 80 de reglas + 55 pasos en navegador (computadora y celular).

## Módulo 6 — terminado (18/11/2026, aprobado)
- Lógica en `src/lib/tesoreria/*` (cajas, acreditaciones, arqueos, cheques, conciliacion, flujo, reintegros, avisos,
  resumen, formulario). Migración `drizzle/0005_modulo6_tesoreria.sql` (solo agrega: tablas nuevas y `medios_pago.caja_id`).
- Pantallas: `/tesoreria` (+ `movimientos`, `tarjetas`, `cheques`, `flujo`, `conciliacion`, `arqueos`, `cajas`) y
  `/caja` (caja del día, todos los usuarios). Pagos a proveedores y compras de contado eligen caja / cheque / metal
  (componente `src/components/origen-pago.tsx`). Devolución con reintegro elige caja. Ficha del cliente: devolver
  saldo a favor y recibir cheque.
- Decisiones: cada caja tiene una sola moneda; el saldo es la suma de sus movimientos (nada se borra, se anulan).
  Lo cobrado entra en la caja del medio (`cobroACaja`, dentro de la transacción de la venta). Tarjetas: caja
  «Tarjetas a acreditar»; la liquidación pasa el NETO al banco y la comisión y retenciones quedan como gastos con su
  categoría. Cheque propio: no mueve el banco hasta «Se debitó». Arqueo: la diferencia se registra como movimiento
  (`arqueo`) y avisa; la vendedora cuenta sin ver lo esperado. Divisas: en caja propia de cada moneda; equivalentes al
  dólar de referencia a la COMPRA. Efectivo no puede quedar negativo (sí bancos). Flujo de fondos: clientes por FIFO
  (lo cobrado cancela lo más viejo). Al anular una venta con tarjeta ya acreditada queda un contracargo pendiente.
- Datos de ejemplo: las señas de ejemplo del módulo 5 también entran en las cajas; «Quitar los datos de ejemplo»
  las saca (limpia movimientos huérfanos). Por eso: quitar los ejemplos ANTES de cargar saldos iniciales y abrir caja.
- Pruebas: 91 de reglas + 62 pasos en navegador (computadora y celular).

## Módulo 7 — terminado (19/11/2026, falta el OK de la dueña)
- Lógica: `src/lib/arca/*` (certificados con node-forge, WSAA con CMS firmado SHA-256, WSFEv1 por SOAP con
  fast-xml-parser; `usarTransporte` permite simular ARCA en pruebas) y `src/lib/facturacion/*` (calculo, emision,
  pdf, libros, puntos, vista, avisos). Migración `drizzle/0006_modulo7_facturacion.sql` (solo agrega:
  `comprobantes_fiscales`, `puntos_venta`, `arca_tokens`, `productos.tratamiento_iva`).
- Pantallas: `/facturacion` (+ `pendientes`, `sin-facturar`, `nota-debito`, `libros`, `configuracion`); ficha de
  la venta con su facturación (PDF, reintentar, facturar ahora, anular con NC); mostrador muestra el resultado del CAE.
- Decisiones: precios finales con IVA incluido (se calcula hacia adentro); total facturado = subtotal − descuento +
  recargos (el canje es un medio de pago; las gift cards no se facturan al venderlas: se facturan al usarse); el CAE se
  pide fuera de la transacción de la venta (nunca la frena); emisiones serializadas; ambiente por defecto «simulado»;
  `fiscal.condicion_iva` por defecto Responsable inscripto (A CONFIRMAR); tope de identificación de consumidor final
  configurable ($ 10.000.000 por defecto, A CONFIRMAR); bien usado = IVA sobre (precio − costo) (A CONFIRMAR con el
  contador). Anular una venta con factura autorizada exige NC; con una factura «a medio pedir» (número pedido sin
  respuesta) no se deja anular hasta reintentarla.
- ARCA no es accesible desde el entorno de desarrollo: probado con respuestas simuladas (aprobado, rechazo, corte de
  conexión con recuperación por FECompConsultar) y la firma CMS verificada con OpenSSL. Falta la prueba real en
  homologación con el certificado de la dueña.
- Pruebas: 102 de reglas + 67 pasos en navegador.

## Próximo: Módulo 8 — cumplimiento (UIF, compra de oro usado) e informes / panel de control
