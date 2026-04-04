import React from 'react';
import Form from '@/renderer/components/utils/Form/Form';
import { Field } from '@/renderer/components/utils/Form/types';
import { ScraperIdentityDraft } from '@/shared/scraper';

type Props = {
  draft: ScraperIdentityDraft;
  onSubmit: (draft: ScraperIdentityDraft) => void;
};

const fields: Field[] = [
  {
    name: 'kind',
    label: 'Type de source',
    type: 'radio',
    layout: 'cards',
    required: true,
    options: [
      {
        label: 'Site',
        value: 'site',
        description: 'Pour une source HTML ou basee sur des selecteurs et des pages web.',
      },
      {
        label: 'API',
        value: 'api',
        description: 'Brique preparee pour plus tard, pour une source HTTP/JSON ou documentee.',
      },
    ],
  },
  {
    name: 'name',
    label: 'Nom',
    type: 'text',
    required: true,
    placeholder: 'Exemple : Momoniji',
  },
  {
    name: 'baseUrl',
    label: 'Domaine ou URL de base',
    type: 'text',
    required: true,
    placeholder: 'Exemple : https://momoniji.com ou momoniji.com',
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Optionnel. Decris la source et son role dans l\'application.',
  },
];

export default function ScraperIdentityStep({ draft, onSubmit }: Props) {
  return (
    <section className="scraper-config-step">
      <div className="scraper-config-step__intro">
        <h3>Configurer la source</h3>
        <p>
          Cette premiere etape pose l&apos;identite du scraper. Le mode <strong>site</strong> est
          le chemin principal pour cette V1, mais on garde deja la brique <strong>API</strong>
          pour eviter une refonte plus tard.
        </p>
      </div>

      <div className="scraper-config-note">
        <strong>V1</strong>
        <span>
          On va jusqu&apos;a la validation d&apos;accessibilite uniquement. La configuration des
          fonctionnalites arrive ensuite.
        </span>
      </div>

      <Form
        fields={fields}
        onSubmit={(values) =>
          onSubmit({
            kind: values.kind as ScraperIdentityDraft['kind'],
            name: String(values.name || '').trim(),
            baseUrl: String(values.baseUrl || '').trim(),
            description: String(values.description || '').trim(),
          })
        }
        initialValues={draft}
        submitButtonId="scraper-config-next"
        formId="scraper-config-identity-form"
      />

      <div className="scraper-config-step__actions">
        <button id="scraper-config-next" type="button" className="primary">
          Continuer vers la validation
        </button>
      </div>
    </section>
  );
}
