/** Íconos de trazo fino (estilo Lucide), dibujados acá para no depender de librerías. */
type P = { className?: string };
const base = (d: React.ReactNode) =>
  function Icono({ className = "size-5" }: P) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {d}
      </svg>
    );
  };

export const IconoInicio = base(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></>);
export const IconoMostrador = base(<><path d="M3 7h18l-1.5 9h-15z" /><path d="M8 7V5a4 4 0 0 1 8 0v2" /><circle cx="9" cy="20" r="1" /><circle cx="17" cy="20" r="1" /></>);
export const IconoVentas = base(<><path d="M4 4h16v16H4z" /><path d="M8 9h8M8 13h8M8 17h4" /></>);
export const IconoCaja = base(<><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M7 8V5h10v3" /><circle cx="12" cy="14" r="2" /></>);
export const IconoAnillo = base(<><circle cx="12" cy="14" r="6.5" /><path d="m9.5 4 2.5 3 2.5-3-1-1.5h-3z" /></>);
export const IconoClientes = base(<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>);
export const IconoTaller = base(<><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18l3 3 6.2-6.2a4 4 0 0 0 5.3-5.3l-2.5 2.5-2.5-.5-.5-2.5z" /></>);
export const IconoProveedores = base(<><path d="M3 7h13v10H3z" /><path d="M16 10h3l2 3v4h-5" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>);
export const IconoTesoreria = base(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M16 15h2" /></>);
export const IconoFactura = base(<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5" /><path d="M9 13h7M9 17h5" /></>);
export const IconoInformes = base(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
export const IconoUsuarios = base(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const IconoAuditoria = base(<><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>);
export const IconoAjustes = base(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>);
export const IconoMenu = base(<path d="M4 7h16M4 12h16M4 17h16" />);
export const IconoCerrar = base(<path d="M6 6l12 12M18 6 6 18" />);
export const IconoSalir = base(<><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4" /><path d="M6 12h10" /></>);
export const IconoMas = base(<path d="M12 5v14M5 12h14" />);
export const IconoExcel = base(<><path d="M6 3h9l4 4v14H6z" /><path d="m9 11 5 6M14 11l-5 6" /></>);
export const IconoPdf = base(<><path d="M6 3h9l4 4v14H6z" /><path d="M9 14h6M9 17h4M9 11h2" /></>);
export const IconoCandado = base(<><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></>);
export const IconoFlecha = base(<path d="m9 6 6 6-6 6" />);
export const IconoDescarga = base(<><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>);
export const IconoCotizaciones = base(<><path d="M3 17l5-5 4 3 7-8" /><path d="M15 7h4v4" /></>);
export const IconoCampana = base(<><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10 20a2 2 0 0 0 4 0" /></>);
export const IconoActualizar = base(<><path d="M20 11a8 8 0 0 0-14.5-4.5L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16" /><path d="M20 20v-4h-4" /></>);
