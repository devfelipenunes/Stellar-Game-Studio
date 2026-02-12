# 🎯 Guia Rápido - Circuito ZK-Porrinha

## ✅ Status: Circuito Compilado e Testado!

```
✅ Constraint system successfully built!
✅ 5 tests passed
✅ Artefato gerado: target/zk_porrinha.json (52KB)
```

---

## 🚀 Quick Start

### 1️⃣ Instalar Dependências

```bash
# No diretório do circuito
cd circuits/zk-porrinha

# Instalar dependências Node.js (para scripts)
npm install
# ou
bun install
```

### 2️⃣ Gerar Commitment

```bash
# Gerar commitment para hand_value=3, salt=12345
node scripts/generate-commitment.js 3 12345

# Ou com bun
bun scripts/generate-commitment.js 3 12345
```

**Output esperado:**
```
✅ Commitment gerado com sucesso!
═══════════════════════════════════════════════════════════════
📊 Hand Value: 3
🔑 Salt: 12345
🔒 Commitment: 0x1234567890abcdef...
═══════════════════════════════════════════════════════════════
```

### 3️⃣ Testar o Circuito

```bash
# Executar todos os testes
nargo test

# Teste específico
nargo test test_valid_hand_within_limit

# Com output detalhado
nargo test --show-output
```

### 4️⃣ Compilar

```bash
# Compilar circuito
nargo compile

# Ver informações sobre constraints
nargo info
```

---

## 📝 Como Usar no Frontend

### Passo 1: Gerar Commitment (Off-chain)

```typescript
import { poseidon } from 'poseidon-lite';

// Jogador escolhe valores secretos
const handValue = 3; // 0-5 dedos
const salt = crypto.getRandomValues(new Uint8Array(32)); // Salt aleatório

// Gerar commitment
const saltBigInt = BigInt('0x' + Array.from(salt)
  .map(b => b.toString(16).padStart(2, '0'))
  .join(''));

const commitment = poseidon([BigInt(handValue), saltBigInt]);
```

### Passo 2: Gerar Prova ZK

```typescript
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import circuit from './target/zk_porrinha.json';

// Inicializar Noir
const backend = new BarretenbergBackend(circuit);
const noir = new Noir(circuit, backend);

// Preparar inputs
const inputs = {
  hand_value: handValue.toString(),
  salt: '0x' + saltBigInt.toString(16).padStart(64, '0'),
  commitment: '0x' + commitment.toString(16).padStart(64, '0'),
  max_allowed: '5'
};

// Gerar prova (pode levar alguns segundos)
const { proof, publicInputs } = await noir.generateProof(inputs);

console.log('Prova gerada:', proof);
console.log('Inputs públicos:', publicInputs);
```

### Passo 3: Enviar para o Contrato

```typescript
// No frontend, após gerar a prova
await zkPorrinhaService.commitHand(
  roomId,
  playerAddress,
  commitment, // BytesN<32>
  proof,      // Bytes (prova ZK)
  signer
);
```

### Passo 4: Revelar (após ambos commitarem)

```typescript
// Revelar valores originais
await zkPorrinhaService.revealHand(
  roomId,
  playerAddress,
  handValue, // u32 (0-5)
  salt,      // BytesN<32>
  signer
);

// O contrato verifica:
// hash(handValue + salt) == commitment salvo anteriormente
```

---

## 🔐 Arquitetura de Segurança

### Propriedades Garantidas

1. **Hiding** 🔒
   - O `hand_value` nunca é revelado na prova
   - Apenas o commitment é público

2. **Binding** 🔗
   - O commitment não pode ser alterado após criação
   - Impossível trapacear mudando o valor depois

3. **Range-bounded** 📊
   - Constraint garante: `0 ≤ hand_value ≤ 5`
   - Impossível escolher valores inválidos

4. **Soundness** ✅
   - Provador não pode gerar provas falsas
   - Verificador sempre detecta trapaças

---

## 📊 Especificações Técnicas

### Constraints
- **Total**: 2 constraints principais
  1. Range proof: `hand_value <= max_allowed`
  2. Commitment integrity: `poseidon([hand_value, salt]) == commitment`

### Hash Function
- **Algoritmo**: Poseidon Standard BN254
- **Biblioteca JS**: `poseidon-lite` v0.2.0
- **Compatibilidade**: Stellar Protocol 25 + Soroban

### Performance
- **Tempo de prova**: ~2-5 segundos (depende do hardware)
- **Tamanho da prova**: ~1.5 KB
- **Gas cost (Soroban)**: ~500K XLM (estimativa)

---

## 🧪 Testes Incluídos

```bash
✅ test_valid_hand_within_limit      # hand=3, limite=5 (válido)
✅ test_edge_case_zero_palitos       # hand=0 (válido)
✅ test_edge_case_max_palitos        # hand=5, limite=5 (válido)
❌ test_invalid_hand_exceeds_limit   # hand=6, limite=5 (deve falhar)
❌ test_invalid_commitment           # commitment errado (deve falhar)
```

---

## 🔧 Troubleshooting

### Erro: "Compiler version incompatible"
```bash
# Atualizar Noir
noirup

# Ou instalar versão específica
noirup -v 0.34.0
```

### Erro: "poseidon-lite not found"
```bash
# Instalar dependência
npm install poseidon-lite
# ou
bun add poseidon-lite
```

### Erro: "Invalid proof"
- Verifique se o commitment foi calculado corretamente
- Certifique-se de usar Poseidon BN254 (não outras variantes)
- Verifique se hand_value está no intervalo [0, 5]

---

## 📚 Referências

- **Noir Docs**: https://noir-lang.org/
- **Poseidon Hash**: https://www.poseidon-hash.info/
- **Barretenberg Backend**: https://github.com/AztecProtocol/barretenberg
- **Stellar Soroban**: https://soroban.stellar.org/

---

## 🎮 Próximos Passos

1. ✅ Circuito implementado e testado
2. ⏳ Integrar com hook `useZkProof` no frontend
3. ⏳ Deploy do Verifier Contract no Soroban
4. ⏳ Testar fluxo completo: Commit → Reveal → Verify

---

**Feito com ❤️ por Stellar Game Studio**
