# Guion del video demo — AgroRoot

**Duración objetivo:** 2 a 3 minutos  
**Tagline:** “De una foto en WhatsApp a plata en tu bolsillo, sin comprar cripto, sin pagar gas.”  
**Pantallas a mostrar:** `chat-simulado.html` → dashboard corporativo (Persona B) → hash en Sepolia Etherscan.

Usar este texto como voz en off. Entre corchetes van las acciones de pantalla.

---

## 1. Introducción (≈ 30 s)

**Pantalla:** logo / título AgroRoot, o el header del chat con “AgroRoot Bot”.

**Narración:**

En el campo boliviano, mucha gente conserva la tierra pero no tiene cuenta bancaria ni forma de cobrar por ese impacto. Al mismo tiempo, las empresas necesitan demostrar ESG real, no greenwashing.

AgroRoot une esas dos necesidades. El agricultor manda una foto geolocalizada por WhatsApp. Eso crea un Punto de Impacto Verificado, un PIV. Una empresa lo financia. El pago llega en USDT a una smart account, sin que el agricultor compre cripto ni pague gas.

Nuestro tagline es: *De una foto en WhatsApp a plata en tu bolsillo, sin comprar cripto, sin pagar gas.*

---

## 2. Flujo del agricultor (≈ 45 s)

**Pantalla:** abrir `chat-simulado.html` a pantalla completa. Recorrer de arriba abajo las tres burbujas. Si hay tiempo, mostrar también que es responsive.

**Narración:**

Así se ve el chat. El contacto es AgroRoot Bot, en línea.

El agricultor —en este demo, Rosa Mamani Quispe, número +591 700 00 123— envía una foto de su parcela de soya en Santa Cruz, Bolivia, junto con la ubicación.

El bot responde al instante: recibimos la foto y registramos el PIV en estado Pending. Ya está visible para la empresa. No hay login ni contraseña: la identidad es el número de WhatsApp.

En producción esto entra por Twilio Sandbox. Para el video usamos esta interfaz simulada, idéntica a WhatsApp Web, para que el jurado vea el flujo completo aunque el sandbox esté en otra máquina.

---

## 3. Dashboard corporativo y WDK Gasless (≈ 60 s)

**Pantalla:** dashboard de la Persona B. Mostrar la tarjeta del PIV Pending (foto + ubicación). Antes de confirmar, **dejar en cuadro la cotización de gas en USDT**. Luego clic en “Financiar por 25 USDT”.

**Narración:**

Pasamos al panel corporativo. La empresa ve los PIV pendientes: foto de la parcela, departamento y estado Pending.

El precio del MVP es fijo: 25 USDT por parcela. No hay subastas. El objetivo del track es el riel de pago gasless, no un marketplace.

Antes de confirmar, el dashboard muestra la cotización del gas en USDT. Ese número lo da el paymaster en Sepolia. El jurado tiene que ver esta cotización en pantalla **antes** de que la empresa pulse financiar. Es un criterio explícito del track.

Al confirmar, el backend —módulo WDK de la Persona A— hace tres cosas: crea la smart account ERC-4337 si el agricultor aún no tenía una, arma la UserOperation de 25 USDT hacia esa cuenta, y el paymaster cubre el ETH de Sepolia por detrás. El agricultor no toca gas nativo en ningún momento.

El PIV pasa a Funded y se guarda el hash de la transacción.

---

## 4. Cierre y verificación (≈ 30 s)

**Pantalla:** volver a `chat-simulado.html`, burbuja del pago. Luego abrir el enlace de Sepolia Etherscan (en el demo en vivo, el hash **real** que produjo el script WDK; en el HTML simulado el enlace es de muestra).

**Narración:**

Cerramos el loop. El agricultor recibe en WhatsApp: tu parcela fue financiada, recibiste 25 USDT en tu Smart Account, sin comisiones de gas.

El mensaje trae el recibo: el hash en Sepolia Etherscan. Eso es la prueba criptográfica del pago.

De una foto en WhatsApp a plata en el bolsillo. Sin comprar cripto. Sin pagar gas. Eso es AgroRoot.

**Cortar** en la página de Etherscan con el hash visible.

---

## Notas para quien graba

- Duración total si se lee con calma: ~2:45. Si se acelera un poco, ~2:15.
- No narrar código ni nombres de archivos salvo `WhatsApp` y `Etherscan`.
- El momento obligatorio en cuadro: **fee en USDT antes del clic de financiar**.
- Si el hash real aún no está, grabar intro + chat simulado primero y empalmar Etherscan cuando Persona A tenga el script WDK funcionando.
- Datos de apoyo: Rosa Mamani Quispe, `+59170000123`, Santa Cruz, `parcela1.jpg` — coinciden con `datos-prueba.json` y el chat simulado.
