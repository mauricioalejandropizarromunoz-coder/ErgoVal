import React, { useRef } from 'react';
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Sparkles,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { GeneralStudyData, MethodId } from '../types/ergonomics';

interface GeneralDataFormProps {
  data: GeneralStudyData;
  onChange: (next: GeneralStudyData) => void;
  onLoadPreset: (presetKey: 'pose' | 'libro' | 'blank') => void;
  onQuickAddMethodTab: (method: MethodId, taskHint: string) => void;
  onGoToFirstTab: () => void;
}

export function GeneralDataForm({
  data,
  onChange,
  onLoadPreset,
  onQuickAddMethodTab,
  onGoToFirstTab,
}: GeneralDataFormProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);

  const updateField = <K extends keyof GeneralStudyData>(key: K, value: GeneralStudyData[K]) => {
    onChange({ ...data, [key]: value });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateField('companyLogoDataUrl', reader.result as string);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleHazard = (key: keyof GeneralStudyData['hazardsIdentified']) => {
    onChange({
      ...data,
      hazardsIdentified: {
        ...data.hazardsIdentified,
        [key]: !data.hazardsIdentified[key],
      },
    });
  };

  const hazardCards: {
    key: keyof GeneralStudyData['hazardsIdentified'];
    title: string;
    chapter: string;
    criteria: string;
    recommendedMethod: MethodId;
    recommendedLabel: string;
  }[] = [
    {
      key: 'manipulacion_cargas',
      title: 'Manipulación Manual de Cargas',
      chapter: 'Prioridad 1 · Cap. 5 y 9',
      criteria: 'Levantamiento, descenso, empuje, tracción o transporte manual de objetos ≥ 3 kg.',
      recommendedMethod: MethodId.NIOSH,
      recommendedLabel: '+ Pestaña NIOSH',
    },
    {
      key: 'movimientos_repetitivos',
      title: 'Movimientos Repetitivos de MMSS',
      chapter: 'Prioridad 2 · Cap. 6 y 9',
      criteria: 'Ciclos breves (< 30 s) o acciones idénticas durante más del 50 % del ciclo operativo.',
      recommendedMethod: MethodId.OCRA_CHECKLIST,
      recommendedLabel: '+ Pestaña OCRA',
    },
    {
      key: 'posturas_forzadas',
      title: 'Posturas Forzadas o Estáticas',
      chapter: 'Prioridad 3 · Cap. 4',
      criteria: 'Flexión/torsión vertebral, brazos elevados, cuclillas o mantenimiento estático prolongado.',
      recommendedMethod: MethodId.REBA,
      recommendedLabel: '+ Pestaña REBA',
    },
    {
      key: 'vibraciones',
      title: 'Vibraciones Mecánicas',
      chapter: 'Prioridad 4 · Cap. 8',
      criteria: 'Conducción de maquinaria móvil (cuerpo entero) o uso de herramientas motorizadas (mano-brazo).',
      recommendedMethod: MethodId.ISO_5349,
      recommendedLabel: '+ Pestaña ISO 5349',
    },
    {
      key: 'ambiente_termico',
      title: 'Ambiente Térmico (Confort / Calor)',
      chapter: 'Prioridad 5 · Cap. 7',
      criteria: 'Disconfort higrotérmico en interiores (Fanger) o exposición a fuentes intensas de calor (WBGT).',
      recommendedMethod: MethodId.WBGT,
      recommendedLabel: '+ Pestaña WBGT',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Barra de inicio ágil / Plantillas de estudio */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900">
              Identificación Institucional, Profesional y del Puesto Evaluado
            </h2>
            <p className="text-sm text-slate-600 max-w-[72ch]">
              Complete los datos de cabecera que estructuran las carátulas y tablas del informe PDF y Word, o cargue un caso modelo resuelto para explorar todas las pestañas de cálculo.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onLoadPreset('pose')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5 text-sky-700" />
              Caso Informe POSE S.A. (5 pestañas)
            </button>
            <button
              type="button"
              onClick={() => onLoadPreset('libro')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-800 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-700" />
              Ejemplos del Libro Cap. 4–8 (6 pestañas)
            </button>
            <button
              type="button"
              onClick={() => onLoadPreset('blank')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <FilePlus2 className="w-3.5 h-3.5 text-slate-600" />
              Limpiar formulario
            </button>
          </div>
        </div>
      </section>

      {/* Grid principal: Empresa + Evaluador */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* 1. Datos de la Empresa Evaluada */}
        <section className="xl:col-span-6 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-700" />
              <h3 className="text-sm font-semibold text-slate-900">1. Datos de la Empresa Evaluada</h3>
            </div>
            <span className="text-xs text-slate-500">Sección 1 · Tabla 10.3</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Razón Social / Organización</label>
              <input
                type="text"
                value={data.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                placeholder="Ej. Metalúrgica Industrial S.A."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">CUIT / Identificación Fiscal</label>
              <input
                type="text"
                value={data.companyTaxId}
                onChange={(e) => updateField('companyTaxId', e.target.value)}
                placeholder="30-00000000-0"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Dotación Total del Establecimiento</label>
              <input
                type="number"
                min={1}
                value={data.companyTotalWorkers}
                onChange={(e) => updateField('companyTotalWorkers', Math.max(1, Number(e.target.value) || 1))}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Actividad Principal / CIIU</label>
              <input
                type="text"
                value={data.companyActivity}
                onChange={(e) => updateField('companyActivity', e.target.value)}
                placeholder="Fabricación, montaje, logística, servicios..."
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Domicilio Operativo / Planta Evaluada</label>
              <input
                type="text"
                value={data.companyAddress}
                onChange={(e) => updateField('companyAddress', e.target.value)}
                placeholder="Calle, número, localidad y provincia"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>

          {/* Logo opcional para encabezado PDF/Word */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {data.companyLogoDataUrl ? (
                <img
                  src={data.companyLogoDataUrl}
                  alt="Logo institucional"
                  className="h-10 w-auto max-w-28 object-contain rounded border border-slate-200 p-1 bg-slate-50"
                />
              ) : (
                <div className="h-10 px-3 flex items-center justify-center rounded border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                  Sin logo cargado
                </div>
              )}
              <div className="text-xs text-slate-500">
                Logo institucional opcional para el membrete de exportación PDF / Word.
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                Subir logo
              </button>
              {data.companyLogoDataUrl && (
                <button
                  type="button"
                  onClick={() => updateField('companyLogoDataUrl', undefined)}
                  className="p-1.5 rounded border border-slate-200 text-slate-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  title="Quitar logo"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </section>

        {/* 2. Datos del Evaluador */}
        <section className="xl:col-span-6 rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-700" />
              <h3 className="text-sm font-semibold text-slate-900">2. Profesional Evaluador y Vigencia</h3>
            </div>
            <span className="text-xs text-slate-500">Firma y Fechas del Estudio</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Nombre y Apellido del Evaluador</label>
              <input
                type="text"
                value={data.evaluatorName}
                onChange={(e) => updateField('evaluatorName', e.target.value)}
                placeholder="Nombre completo del especialista"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">Título Profesional / Especialidad</label>
              <input
                type="text"
                value={data.evaluatorTitle}
                onChange={(e) => updateField('evaluatorTitle', e.target.value)}
                placeholder="Lic. en Higiene y Seguridad / Especialista en Ergonomía"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Matrícula Profesional</label>
              <input
                type="text"
                value={data.evaluatorLicense}
                onChange={(e) => updateField('evaluatorLicense', e.target.value)}
                placeholder="Ej. Matrícula C.P.I.Q 145"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Registro de Ergonomía / Habilitación</label>
              <input
                type="text"
                value={data.evaluatorRegistry}
                onChange={(e) => updateField('evaluatorRegistry', e.target.value)}
                placeholder="Ej. Registro RE 001"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Relevamiento en Campo</label>
              <input
                type="date"
                value={data.evaluationDate}
                onChange={(e) => updateField('evaluationDate', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Fecha de Emisión del Informe</label>
              <input
                type="date"
                value={data.reportDate}
                onChange={(e) => updateField('reportDate', e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Fecha Propuesta de Próxima Reevaluación / Seguimiento
              </label>
              <input
                type="date"
                value={data.nextReevaluationDate}
                onChange={(e) => updateField('nextReevaluationDate', e.target.value)}
                className="w-full sm:w-1/2 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>
          </div>
        </section>
      </div>

      {/* 3. Puesto de Trabajo Evaluado */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-sky-700" />
            <h3 className="text-sm font-semibold text-slate-900">3. Descripción Técnica del Puesto de Trabajo Evaluado</h3>
          </div>
          <span className="text-xs text-slate-500">Secciones 4 y 5 · Tabla 10.3</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-700 mb-1">Denominación del Puesto Evaluado</label>
            <input
              type="text"
              value={data.workstationName}
              onChange={(e) => updateField('workstationName', e.target.value)}
              placeholder="Ej. Operario de Línea de Empaque / Zanjero"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-700 mb-1">Sector / Área / Línea</label>
            <input
              type="text"
              value={data.department}
              onChange={(e) => updateField('department', e.target.value)}
              placeholder="Ej. Producción / Montaje"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Trabajadores Expuestos</label>
            <input
              type="number"
              min={1}
              value={data.exposedWorkersCount}
              onChange={(e) => updateField('exposedWorkersCount', Math.max(1, Number(e.target.value) || 1))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">Jornada Diaria (horas)</label>
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={data.shiftDurationHours}
              onChange={(e) => updateField('shiftDurationHours', Math.max(1, Number(e.target.value) || 8))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Supervisor / Responsable del Sector</label>
            <input
              type="text"
              value={data.supervisorName}
              onChange={(e) => updateField('supervisorName', e.target.value)}
              placeholder="Jefe de Turno / Supervisor"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-8">
            <label className="block text-xs font-medium text-slate-700 mb-1">Régimen de Turnos, Pausas y Descansos</label>
            <input
              type="text"
              value={data.workScheduleAndBreaks}
              onChange={(e) => updateField('workScheduleAndBreaks', e.target.value)}
              placeholder="Ej. Lunes a viernes de 07:00 a 16:00 h; comedor 45 min y 2 pausas de 15 min."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Descripción General del Puesto y Entorno</label>
            <textarea
              rows={3}
              value={data.workstationDescription}
              onChange={(e) => updateField('workstationDescription', e.target.value)}
              placeholder="Características espaciales, alturas de planos de trabajo, organización del proceso..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Tareas Principales del Ciclo de Trabajo</label>
            <textarea
              rows={3}
              value={data.mainTasks}
              onChange={(e) => updateField('mainTasks', e.target.value)}
              placeholder="Secuencia operativa de subtareas habituales y periódicas..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-700 mb-1">Equipos, Herramientas, Cargas y Mobiliario</label>
            <textarea
              rows={3}
              value={data.equipmentAndFurniture}
              onChange={(e) => updateField('equipmentAndFurniture', e.target.value)}
              placeholder="Herramientas manuales/motorizadas, peso de cargas, bancadas, asientos, EPP..."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-12 pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-4">
            <label className="inline-flex items-center gap-2.5 text-sm font-medium text-slate-800 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={data.previousInjuriesOrSymptoms}
                onChange={(e) => updateField('previousInjuriesOrSymptoms', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
              />
              Existen antecedentes de molestias, sintomatología o lesiones musculoesqueléticas en el puesto (Criterio Cap. 10.2)
            </label>
            {data.previousInjuriesOrSymptoms && (
              <input
                type="text"
                value={data.previousInjuriesDetail}
                onChange={(e) => updateField('previousInjuriesDetail', e.target.value)}
                placeholder="Detalle sintomatología reportada, bajas médicas o registros del Servicio de Medicina Laboral..."
                className="flex-1 rounded-md border border-amber-300 bg-amber-50/40 px-3 py-1.5 text-sm text-slate-900 focus:border-amber-500 focus:outline-none"
              />
            )}
          </div>
        </div>
      </section>

      {/* 4. Paso 1 del Protocolo: Identificación Inicial de Peligros */}
      <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-sky-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              4. Identificación Inicial de Factores de Riesgo (Protocolo Capítulo 9.2 — Paso 1)
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            Marque los peligros presentes y genere pestañas específicas de evaluación
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {hazardCards.map((hz) => {
            const active = data.hazardsIdentified[hz.key];
            return (
              <div
                key={hz.key}
                className={`flex flex-col justify-between p-3.5 rounded-lg border transition-colors ${
                  active ? 'border-sky-600 bg-sky-50/40' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleHazard(hz.key)}
                      className="mt-0.5 w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-600"
                    />
                    <div>
                      <span className="block text-xs font-semibold text-slate-900 leading-snug">{hz.title}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">{hz.chapter}</span>
                    </div>
                  </label>
                  <p className="text-xs text-slate-600 leading-relaxed">{hz.criteria}</p>
                </div>

                <div className="pt-3 mt-3 border-t border-slate-200/70 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-600">
                    {active ? 'Factor presente' : 'No identificado'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (!active) toggleHazard(hz.key);
                      onQuickAddMethodTab(hz.recommendedMethod, `Evaluación de ${hz.title.toLowerCase()}`);
                    }}
                    className="text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap cursor-pointer"
                  >
                    {hz.recommendedLabel}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="button"
            onClick={onGoToFirstTab}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors"
          >
            Continuar a las Pestañas de Estudio Ergonómico
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
}
