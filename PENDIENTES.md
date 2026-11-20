# Pendientes

## Te toca a vos
- [ ] Probar el Módulo 7 (Facturación) en la PC y en el celular y darme el OK (Módulos 1 a 6: aprobados). Hoy funciona en modo SIMULADO (sin validez fiscal).
- [ ] Con el contador, confirmar: condición frente al IVA (inscripto o monotributo), número de punto de venta habilitado para web services, régimen de bienes usados para el oro de canje, y desde qué importe hay que identificar al consumidor final.
- [ ] Certificado de ARCA (gratis): en Facturación → Configuración ARCA generar el pedido (.csr), subirlo en ARCA (primero homologación, después producción) y cargar el certificado que devuelve. Si querés, lo hacemos juntos por videollamada.
- [ ] Revisar las cajas que creé (efectivo pesos/dólares/euros, banco en pesos y en dólares, Mercado Pago, tarjetas y cheques): renombrarlas con sus bancos reales, agregar las que falten y desactivar las que no usen (Tesorería → Cajas y categorías).
- [ ] Antes de empezar en serio: quitar los datos de ejemplo, cargar el saldo inicial de cada caja y desde ese día abrir y cerrar la caja.
- [ ] Contarme cuántos días tarda cada tarjeta en acreditar y qué comisión cobra (para que el flujo de fondos estime mejor).
- [ ] Cargar los recargos o descuentos de cada medio de cobro y de cada plan de cuotas (Configuración → Ventas y cobros; hoy en 0 %).
- [ ] Completar dirección, teléfono y CUIT del local para los comprobantes, y revisar el texto de la garantía y de las condiciones de reparación (misma pantalla).
- [ ] Definir el porcentaje de comisión de cada vendedora (Usuarios).
- [ ] Revisar los textos de los mensajes de WhatsApp (Configuración → Mensajes a clientes).
- [ ] Si tienen clientes en una planilla o cuaderno, pasármelos: armo la importación (como la de piezas).
- [ ] Definir las listas de precios (contado, tarjeta, mayorista): hoy en 0 %.
- [ ] Contarme qué impresora de etiquetas tienen (o si usan hoja A4) para ajustar el tamaño exacto.
- [ ] Si tienen una planilla con las piezas, pasármela: armo el importador a su medida.
- [ ] Cuando carguen piezas reales: quitar las de ejemplo (Configuración → Stock y etiquetas).
- [ ] Definir los ajustes de cada ley (Configuración → Cotizaciones y leyes): cuánto sobre el mercado venden el gramo
      y cuánto menos pagan el oro usado. Hoy están en 0 %.
- [ ] Elegir el dólar de referencia (hoy: blue) y, si quieren, una carpeta de Google Drive para la copia diaria.
- [ ] Cambiar las claves de prueba (`maria`, `lucia`) antes de cargar datos reales.
- [ ] Cuando puedas, las preguntas que quedaron abiertas (no frenan el desarrollo, hoy van con valores por defecto):
  condición frente al IVA (A/B o C) y puntos de venta; qué dólar usan para el oro; qué ley es su «oro bajo»;
  terminales de cobro y planes de cuotas; impresora de etiquetas; cantidad aproximada de piezas y planillas a importar.

## Desarrollo
- [x] Módulo 2: cotizaciones automáticas + copia de seguridad diaria automática.
- [x] Módulo 3: piezas y stock.
- [x] Módulo 4: clientes, proveedores y compras.
- [x] Módulo 5: ventas, señas, pedidos a medida y reparaciones.
- [x] Módulo 6: tesorería.
- [x] Módulo 7: facturación electrónica ARCA y ventas sin facturar (falta la prueba real en homologación con el certificado).
- [ ] Módulo 8: cumplimiento e informes.
- [ ] Importación de clientes desde Excel (si la piden).
- [ ] Módulos 3 a 8 según el plan.
- [ ] `exceljs` arrastra una versión de `uuid` con un aviso de seguridad moderado (no afecta el uso que hacemos);
      revisar si sale una versión nueva de exceljs.
