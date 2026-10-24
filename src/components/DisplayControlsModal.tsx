import React from 'react';
import { Check, Eye, RotateCcw, Sliders, SunMedium, Type, X } from 'lucide-react';
import { CanvasTheme, DisplayPreferences, FontSize, TextContrast } from '../types/ergonomics';

interface DisplayControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  preferences: DisplayPreferences;
  onChangePreferences: (next: DisplayPreferences) => void;
  onResetPreferences: () => void;
}

export function DisplayControlsModal({
  isOpen,
  onClose,
  preferences,
  onChangePreferences,
  onResetPreferences,
}: DisplayControlsModalProps) {
  if (!isOpen) return null;

  const themes: { id: CanvasTheme; name: string; desc: string; bgClass: string; cardClass: string }[] = [
    {
      id: 'pizarra',
      name: 'Pizarra Suave (Recomendado)',
      desc: 'Azul-pizarra descansado que separa claramente las tarjetas blancas de trabajo.',
      bgClass: 'bg-[#dfe8f1]',
      cardClass: 'bg-white border-slate-300',
    },
    {
      id: 'blanco',
      name: 'Blanco Técnico Neutro',
      desc: 'Fondo gris neutro muy suave para un estilo clásico de ingeniería.',
      bgClass: 'bg-[#f1f5f9]',
      cardClass: 'bg-white border-slate-300',
    },
    {
      id: 'calido',
      name: 'Papel Sepia Cálido',
      desc: 'Tonalidad cálida de baja emisión de luz azul, ideal para lectura prolongada.',
      bgClass: 'bg-[#f4eee3]',
      cardClass: 'bg-[#fffdf9] border-amber-200/90',
    },
    {
      id: 'gris',
      name: 'Gris Calibrado Industrial',
      desc: 'Fondo gris de medio tono para auditorías en ambientes con iluminación intensa.',
      bgClass: 'bg-[#d8e2ec]',
      cardClass: 'bg-white border-slate-400/80',
    },
    {
      id: 'oscuro',
      name: 'Modo Oscuro / Planta',
      desc: 'Fondo de alta absorción lumínica para plantas oscuras o auditorías nocturnas.',
      bgClass: 'bg-[#0f172a]',
      cardClass: 'bg-[#1e293b] border-slate-700 text-slate-100',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-slate-300 max-w-xl w-full flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <Eye className="w-5 h-5 text-sky-400" />
            <h3 className="text-base font-semibold">Controles de Visualización y Contraste</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-5 space-y-6 text-xs text-slate-700 max-h-[80vh] overflow-y-auto">
          {/* 1. Selector de Fondo de Pantalla */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
                <SunMedium className="w-4 h-4 text-sky-700" />
                Color de Fondo de la Pantalla
              </span>
              <span className="text-slate-500">Ajuste de descanso visual</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {themes.map((t) => {
                const active = preferences.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onChangePreferences({ ...preferences, theme: t.id })}
                    className={`p-3 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      active
                        ? 'border-sky-600 ring-2 ring-sky-600/30 bg-sky-50/50'
                        : 'border-slate-300 hover:border-slate-400 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="font-semibold text-slate-900">{t.name}</span>
                      {active && <Check className="w-4 h-4 text-sky-600 shrink-0" />}
                    </div>
                    {/* Muestra visual de contraste */}
                    <div className={`w-full h-8 rounded border flex items-center justify-center p-1 ${t.bgClass}`}>
                      <div className={`w-3/4 h-5 rounded text-[10px] flex items-center justify-center font-medium shadow-2xs ${t.cardClass}`}>
                        Zona de Carga
                      </div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-2 leading-tight">{t.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Contraste de Texto y Legibilidad */}
          <div className="space-y-2.5 pt-4 border-t border-slate-200">
            <span className="font-semibold text-sm text-slate-900 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-sky-700" />
              Contraste de Texto y Tipografía
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Intensidad de Contraste</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangePreferences({ ...preferences, textContrast: 'normal' })}
                    className={`py-2 px-3 rounded border text-center font-medium cursor-pointer ${
                      preferences.textContrast === 'normal'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Estándar
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangePreferences({ ...preferences, textContrast: 'alto' })}
                    className={`py-2 px-3 rounded border text-center font-bold cursor-pointer ${
                      preferences.textContrast === 'alto'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-300 text-black hover:bg-slate-50'
                    }`}
                  >
                    Alto Contraste
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1.5">Tamaño de Letra</label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => onChangePreferences({ ...preferences, fontSize: 'normal' })}
                    className={`py-2 px-3 rounded border text-center font-medium cursor-pointer ${
                      preferences.fontSize === 'normal'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Normal (100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangePreferences({ ...preferences, fontSize: 'grande' })}
                    className={`py-2 px-3 rounded border text-center font-medium cursor-pointer ${
                      preferences.fontSize === 'grande'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Grande (+15%)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Resaltado Máximo de Campos de Carga de Datos */}
          <div className="space-y-2 pt-4 border-t border-slate-200">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-300 bg-slate-50/70 hover:bg-slate-100 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={preferences.highlightInputs}
                onChange={(e) => onChangePreferences({ ...preferences, highlightInputs: e.target.checked })}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
              />
              <div>
                <span className="font-semibold text-slate-900 block">
                  Resaltar enérgicamente todos los campos de carga y selección
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  Aplica un contorno de alto contraste y fondo diferenciado sobre cada casilla numérica, desplegable y tarjeta de ángulo para que sea imposible omitir un dato en campo.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Pie con botón de restauración */}
        <div className="px-5 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onResetPreferences}
            className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restablecer valores por defecto
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            Aplicar y Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
