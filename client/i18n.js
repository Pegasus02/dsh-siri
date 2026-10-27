// dsh-siri ships a single (Chinese) language, so the translation hooks are identities.
import * as React from 'react';
export const h = React.createElement;
export const localizeText = (value) => value;
