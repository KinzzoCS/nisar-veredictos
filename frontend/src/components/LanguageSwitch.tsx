import { useTranslation } from 'react-i18next'
import { LANGS } from '../i18n'

export function LanguageSwitch() {
  const { t, i18n } = useTranslation()
  return (
    <div role="group" aria-label={t('language.label')} className="language-switch">
      {LANGS.map((lang) => (
        <button
          key={lang}
          type="button"
          lang={lang}
          aria-pressed={i18n.language === lang}
          onClick={() => void i18n.changeLanguage(lang)}
        >
          {t(`language.${lang}`)}
        </button>
      ))}
    </div>
  )
}
