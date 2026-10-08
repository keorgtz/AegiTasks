import { useEffect, useId, useState } from 'react';
import type { ZxcvbnFactory } from '@zxcvbn-ts/core';
import './styles/password-strength.css';

let estimator: Promise<ZxcvbnFactory> | undefined;
function loadEstimator() {
  return (estimator ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ])
    .then(
      ([core, common, en]) =>
        new core.ZxcvbnFactory({
          graphs: common.adjacencyGraphs,
          dictionary: {
            ...common.dictionary,
            ...en.dictionary,
            local: [
              'contraseña',
              'contrasena',
              'administrador',
              'bienvenido',
              'mexico',
              'aegitasks',
              'keorsoft',
            ],
          },
        }),
    )
    .catch((error) => {
      estimator = undefined;
      throw error;
    }));
}

const labels = ['Muy débil', 'Débil', 'Moderada', 'Fuerte', 'Muy fuerte'];
export function PasswordStrength({
  password,
  context = [],
}: {
  password: string;
  context?: string[];
}) {
  const [result, setResult] = useState<{ score: number; sample: string } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const id = useId();
  const dictionary = context.join('\n');
  useEffect(() => {
    if (!password) return;
    let live = true;
    // Debounce and limit analysis work, never truncate the password that is actually saved.
    const timer = setTimeout(() => {
      void loadEstimator()
        .then((check) => {
          if (!live) return;
          const score = check.check(password.slice(0, 128), dictionary.split('\n')).score;
          setResult({ score, sample: password });
          setUnavailable(false);
        })
        .catch(() => {
          if (live) setUnavailable(true);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [password, dictionary]);
  const score = password && result?.sample === password ? result.score : null;
  const label = !password
    ? 'Sin contraseña'
    : score === null
      ? unavailable
        ? 'Medidor no disponible'
        : 'Evaluando…'
      : labels[score];
  return (
    <div className="password-strength" data-strength={!password ? 'empty' : (score ?? 'pending')}>
      <div className="password-strength-heading">
        <span id={id}>Fortaleza estimada</span>
        <strong aria-live="polite">{label}</strong>
      </div>
      <meter
        min={0}
        max={5}
        value={!password || score === null ? 0 : score + 1}
        aria-labelledby={id}
        aria-valuetext={label}
      />
      <small>
        {!password
          ? 'Sin contraseña, cualquiera que conozca tu usuario o correo podrá entrar a tu cuenta.'
          : score !== null && score <= 2
            ? 'Prueba una frase larga e impredecible; evita secuencias, repeticiones y datos personales.'
            : 'La estimación es orientativa y no bloquea el guardado. Se calcula en este dispositivo.'}
      </small>
    </div>
  );
}
