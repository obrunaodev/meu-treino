import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ptBR from '../locales/pt-BR.json'
import enUS from '../locales/en-US.json'

void i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { translation: ptBR },
    'en-US': { translation: enUS },
  },
  // O app é de um usuário brasileiro numa academia brasileira: pt-BR é o
  // padrão, não o idioma do navegador. Quem quiser inglês troca em
  // Configurações, e a escolha volta do `user_settings` no próximo boot.
  lng: 'pt-BR',
  fallbackLng: 'pt-BR',
  interpolation: { escapeValue: false },
})

export default i18n
