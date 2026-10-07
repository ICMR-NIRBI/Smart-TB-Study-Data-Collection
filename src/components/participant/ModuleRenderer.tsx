import React from 'react';
import { Module1Identification } from '../modules/Module1Identification';
import { Module2Eligibility } from '../modules/Module2Eligibility';
import { Module3Baseline } from '../modules/Module3Baseline';
import { Module4Treatment } from '../modules/Module4Treatment';
import { Module5PkSampling } from '../modules/Module5PkSampling';
import { Module6Bioanalysis } from '../modules/Module6Bioanalysis';
import { Module7MonthOne } from '../modules/Module7MonthOne';
import { Module8MonthTwo } from '../modules/Module8MonthTwo';
import { Module9AdverseEvents } from '../modules/Module9AdverseEvents';
import { Module10Closeout } from '../modules/Module10Closeout';
import type { CrfData, M10Reason, ModuleId, ModuleKey, Participant } from '../../types/crf';

interface ModuleRendererProps {
  participant: Participant;
  moduleId: ModuleId;
  readOnly: boolean;
  errors: Record<string, string>;
  onUpdate: <K extends ModuleKey>(key: K, patch: Partial<CrfData[K]>) => void;
  onOpenModule: (id: ModuleId) => void;
  onDiscontinue: (reason: M10Reason) => void;
}

export function ModuleRenderer({ participant, moduleId, readOnly, errors, onUpdate, onOpenModule, onDiscontinue }: ModuleRendererProps) {
  const common = { participant, readOnly, errors, onOpenModule, onDiscontinue };
  const d = participant.data;
  switch (moduleId) {
    case 1:
      return <Module1Identification {...common} data={d.m1} update={(p) => onUpdate('m1', p)} />;
    case 2:
      return <Module2Eligibility {...common} data={d.m2} update={(p) => onUpdate('m2', p)} />;
    case 3:
      return <Module3Baseline {...common} data={d.m3} update={(p) => onUpdate('m3', p)} />;
    case 4:
      return <Module4Treatment {...common} data={d.m4} update={(p) => onUpdate('m4', p)} />;
    case 5:
      return <Module5PkSampling {...common} data={d.m5} update={(p) => onUpdate('m5', p)} />;
    case 6:
      return <Module6Bioanalysis {...common} data={d.m6} update={(p) => onUpdate('m6', p)} />;
    case 7:
      return <Module7MonthOne {...common} data={d.m7} update={(p) => onUpdate('m7', p)} />;
    case 8:
      return <Module8MonthTwo {...common} data={d.m8} update={(p) => onUpdate('m8', p)} />;
    case 9:
      return <Module9AdverseEvents {...common} data={d.m9} update={(p) => onUpdate('m9', p)} />;
    case 10:
      return <Module10Closeout {...common} data={d.m10} update={(p) => onUpdate('m10', p)} />;
    default:
      return null;
  }
}
