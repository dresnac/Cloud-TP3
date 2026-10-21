// Iconos de trazo (24x24, currentColor) para no depender de emojis, que cambian
// de aspecto según el sistema operativo.
function Icono({ children, tam = 20, ...props }) {
  return (
    <svg
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const Bolsa = (p) => (
  <Icono {...p}>
    <path d="M5 8h14l-1 12H6L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </Icono>
);

export const Moto = (p) => (
  <Icono {...p}>
    <circle cx="6" cy="17" r="3" />
    <circle cx="18" cy="17" r="3" />
    <path d="M9 17h6l-2-6H9" />
    <path d="M15 17l1.5-6H19" />
    <path d="M13 7h3l2 4" />
  </Icono>
);

export const Local = (p) => (
  <Icono {...p}>
    <path d="M4 9l1.5-5h13L20 9" />
    <path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" />
    <path d="M5 11v9h14v-9" />
    <path d="M10 20v-5h4v5" />
  </Icono>
);

export const Recibo = (p) => (
  <Icono {...p}>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
    <path d="M9 8h6M9 12h6" />
  </Icono>
);

export const Pin = (p) => (
  <Icono {...p}>
    <path d="M12 21s-6.5-5.4-6.5-11a6.5 6.5 0 0 1 13 0c0 5.6-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icono>
);

export const Mira = (p) => (
  <Icono {...p}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </Icono>
);

export const Camara = (p) => (
  <Icono {...p}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4V8Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icono>
);

export const Chevron = (p) => (
  <Icono {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icono>
);

export const Atras = (p) => (
  <Icono {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icono>
);

export const Salir = (p) => (
  <Icono {...p}>
    <path d="M14 4h5v16h-5" />
    <path d="M10 8l-4 4 4 4M6 12h10" />
  </Icono>
);

export const Check = (p) => (
  <Icono {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icono>
);

export const Cruz = (p) => (
  <Icono {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icono>
);

export const Buscar = (p) => (
  <Icono {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Icono>
);
