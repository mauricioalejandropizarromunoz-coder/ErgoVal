import React from 'react';
import { MethodId, StudyTab } from '../types/ergonomics';
import { BipolarForm, OwasForm, RebaForm, RulaForm } from './forms/PosturalForms';
import {
  JsiForm,
  Lmc295Form,
  Nam295Form,
  NioshForm,
  OcraChecklistForm,
  OcraCompletoForm,
  SnookForm,
} from './forms/LoadAndRepetitiveForms';
import { FangerForm, Iso2631Form, Iso5349Form, WbgtForm } from './forms/EnvironmentForms';

export function PosturalSwitch({
  tab,
  onChange,
}: {
  tab: StudyTab;
  onChange: (updated: StudyTab) => void;
}) {
  const updatePayload = <K extends MethodId>(key: K, val: StudyTab['payloads'][K]) => {
    onChange({
      ...tab,
      payloads: {
        ...tab.payloads,
        [key]: val,
      },
    });
  };

  switch (tab.method) {
    case MethodId.RULA:
      return <RulaForm data={tab.payloads[MethodId.RULA]} onChange={(v) => updatePayload(MethodId.RULA, v)} />;
    case MethodId.REBA:
      return <RebaForm data={tab.payloads[MethodId.REBA]} onChange={(v) => updatePayload(MethodId.REBA, v)} />;
    case MethodId.OWAS:
      return <OwasForm data={tab.payloads[MethodId.OWAS]} onChange={(v) => updatePayload(MethodId.OWAS, v)} />;
    case MethodId.BIPOLAR:
      return <BipolarForm data={tab.payloads[MethodId.BIPOLAR]} onChange={(v) => updatePayload(MethodId.BIPOLAR, v)} />;
    default:
      return null;
  }
}

export function LoadRepetitiveSwitch({
  tab,
  namPoints,
  onChange,
}: {
  tab: StudyTab;
  namPoints?: {
    right: { nam: number; borg: number; zone: string };
    left: { nam: number; borg: number; zone: string };
  };
  onChange: (updated: StudyTab) => void;
}) {
  const updatePayload = <K extends MethodId>(key: K, val: StudyTab['payloads'][K]) => {
    onChange({
      ...tab,
      payloads: {
        ...tab.payloads,
        [key]: val,
      },
    });
  };

  switch (tab.method) {
    case MethodId.NIOSH:
      return <NioshForm data={tab.payloads[MethodId.NIOSH]} onChange={(v) => updatePayload(MethodId.NIOSH, v)} />;
    case MethodId.SNOOK:
      return <SnookForm data={tab.payloads[MethodId.SNOOK]} onChange={(v) => updatePayload(MethodId.SNOOK, v)} />;
    case MethodId.LMC_295:
      return <Lmc295Form data={tab.payloads[MethodId.LMC_295]} onChange={(v) => updatePayload(MethodId.LMC_295, v)} />;
    case MethodId.OCRA_COMPLETO:
      return (
        <OcraCompletoForm
          data={tab.payloads[MethodId.OCRA_COMPLETO]}
          onChange={(v) => updatePayload(MethodId.OCRA_COMPLETO, v)}
        />
      );
    case MethodId.OCRA_CHECKLIST:
      return (
        <OcraChecklistForm
          data={tab.payloads[MethodId.OCRA_CHECKLIST]}
          onChange={(v) => updatePayload(MethodId.OCRA_CHECKLIST, v)}
        />
      );
    case MethodId.JSI:
      return <JsiForm data={tab.payloads[MethodId.JSI]} onChange={(v) => updatePayload(MethodId.JSI, v)} />;
    case MethodId.NAM_295:
      return (
        <Nam295Form
          data={tab.payloads[MethodId.NAM_295]}
          namPoints={namPoints}
          onChange={(v) => updatePayload(MethodId.NAM_295, v)}
        />
      );
    default:
      return null;
  }
}

export function EnvironmentFormsSwitch({
  tab,
  onChange,
}: {
  tab: StudyTab;
  onChange: (updated: StudyTab) => void;
}) {
  const updatePayload = <K extends MethodId>(key: K, val: StudyTab['payloads'][K]) => {
    onChange({
      ...tab,
      payloads: {
        ...tab.payloads,
        [key]: val,
      },
    });
  };

  switch (tab.method) {
    case MethodId.FANGER:
      return <FangerForm data={tab.payloads[MethodId.FANGER]} onChange={(v) => updatePayload(MethodId.FANGER, v)} />;
    case MethodId.WBGT:
      return <WbgtForm data={tab.payloads[MethodId.WBGT]} onChange={(v) => updatePayload(MethodId.WBGT, v)} />;
    case MethodId.ISO_2631:
      return <Iso2631Form data={tab.payloads[MethodId.ISO_2631]} onChange={(v) => updatePayload(MethodId.ISO_2631, v)} />;
    case MethodId.ISO_5349:
      return <Iso5349Form data={tab.payloads[MethodId.ISO_5349]} onChange={(v) => updatePayload(MethodId.ISO_5349, v)} />;
    default:
      return null;
  }
}
