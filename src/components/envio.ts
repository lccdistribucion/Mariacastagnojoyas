"use client";
import { startTransition, type FormEvent } from "react";

/**
 * Envía un formulario a una acción del servidor SIN vaciar los campos (React los vacía si se usa `action=`).
 * Así, si hay un error, la persona no pierde lo que escribió.
 */
export const enviar = (accion: (f: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const datos = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
  startTransition(() => accion(datos));
};
