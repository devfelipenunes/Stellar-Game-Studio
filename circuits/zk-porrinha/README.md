# ZK-Porrinha Circuit

Circuito Zero-Knowledge em Noir para o jogo Porrinha no Stellar.

## 📋 Descrição

Este circuito prova que um jogador escolheu uma quantidade válida de dedos (0-5) sem revelar o valor escolhido. Utiliza:

- **Hash Poseidon BN254**: Compatível com Stellar Protocol 25 e bibliotecas JavaScript
- **Range Proof**: Garante que o valor está no intervalo permitido
- **Commitment Scheme**: Verificação criptográfica da integridade

## 🛠️ Requisitos

- **Noir** (Nargo) >= 0.34.0
- **Stellar SDK** para integração com Soroban

## 📦 Instalação

```bash
# Instalar Noir (se ainda não tiver)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Verificar instalação
nargo --version
```

## 🧪 Testar o Circuito

```bash
# Executar todos os testes
nargo test

# Executar teste específico
nargo test test_valid_hand_within_limit

# Verbose mode
nargo test --show-output
```

## 🔨 Compilar

```bash
# Compilar o circuito
nargo compile

# Gerar artefatos de prova
nargo info
```

## 🎯 Como Usar

### 1. Gerar Commitment (Off-chain)

```typescript
import { poseidon } from 'poseidon-lite';

const handValue = 3; // 0-5 dedos
const salt = BigInt('12345'); // Random salt

// Gerar commitment usando Poseidon BN254
const commitment = poseidon([BigInt(handValue), salt]);
```

### 2. Gerar Prova ZK

```typescript
import { BarretenbergBackend, Noir } from '@noir-lang/noir_js';
import circuit from './target/zk_porrinha.json';

const backend = new BarretenbergBackend(circuit);
const noir = new Noir(circuit, backend);

// Inputs privados + públicos
const inputs = {
  hand_value: 3,
  salt: '12345',
  commitment: commitment.toString(),
  max_allowed: 5
};

// Gerar prova
const proof = await noir.generateProof(inputs);
```

### 3. Verificar Prova (On-chain via Soroban)

```rust
// No contrato Soroban
pub fn commit_hand(
    env: Env,
    room_id: u64,
    player: Address,
    commitment: BytesN<32>,
    proof: Bytes, // Prova ZK gerada
) {
    // Verificar prova via Verifier Contract
    let verifier = VerifierClient::new(&env, &verifier_addr);
    let public_inputs = vec![&env, commitment];
    
    require!(verifier.verify(&proof, &public_inputs), "Invalid ZK proof");
    
    // Salvar commitment
    // ...
}
```

## 📊 Especificação Técnica

### Inputs Privados
- `hand_value: u32` - Quantidade de dedos (0-5)
- `salt: Field` - Salt aleatório de 256 bits

### Inputs Públicos
- `commitment: Field` - Hash Poseidon(hand_value, salt)
- `max_allowed: u32` - Limite máximo permitido (5)

### Constraints
1. **Range Proof**: `hand_value <= max_allowed`
2. **Commitment Integrity**: `poseidon([hand_value, salt]) == commitment`

## 🔐 Segurança

- ✅ Usa Poseidon Standard BN254 (auditado)
- ✅ Compatível com Stellar Protocol 25
- ✅ Hiding: O `hand_value` nunca é revelado na prova
- ✅ Binding: O `commitment` não pode ser alterado após a criação
- ✅ Range-bounded: Impossível trapacear com valores fora do limite

## 📚 Referências

- [Noir Language](https://noir-lang.org/)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Stellar Soroban](https://soroban.stellar.org/)

## 🧩 Integração com Soroban

Ver `contracts/zk-porrinha/src/lib.rs` para o contrato completo que usa este circuito.

## 📄 Licença

MIT License - Stellar Game Studio
