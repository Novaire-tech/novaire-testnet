# Splitting Yield From Principal: Why Novaire Matters on Stellar

Lending pools solved liquidity for yield-bearing positions. Deposit into Blend Capital, receive a claim, watch it grow, exit through a clean interface. What they didn't solve is separation: you can't sell the yield without selling the principal that's earning it.

A Blend position is a single token. Principal and yield move together, permanently. There's no way to hold just the certainty of getting your capital back, and no way to hold just the upside without carrying the capital alongside it.

**The problem with a fused position**

A Blend supply position is a share in a pool. It has no maturity, no fixed term. The rate floats with utilization, and redemption means taking the whole thing out at whatever rate happens to apply that day.

Different holders want different pieces of that. A treasury managing runway wants a known number on a known date, not exposure to next quarter's utilization. A trader wants leveraged yield exposure without locking up capital for months. A lender needing liquidity now would rather sell a discounted claim on future principal than wait out a maturity they can't afford to wait for. One fused token can't serve any of these precisely.

**How Novaire splits it**

Novaire is a set of Soroban contracts, live on Stellar Testnet, built on top of Blend v2.

The wrapper takes a deposit, supplies it into a real Blend pool, and mints a standardized share token priced directly off Blend's own accounting. That standardization is what makes splitting possible: you can't cleanly separate principal from yield on a position whose value is computed inconsistently.

The tokenizer splits that share into two tokens of equal face value at the moment of the split: a principal token and a yield token. The split itself is collateral neutral, so it introduces no risk on its own.

The principal token behaves like a zero coupon bond. It has a maturity date and converges toward the value of the underlying position as that date approaches. It doesn't compute its own redemption price internally, since that pricing logic belongs with whatever observes the live rate.

The yield token is the residual claim, tracked per holder from mint to settlement. Its claim is junior to the principal token's: yield only pays out once enough of the underlying position is set aside to cover outstanding principal at the current rate. That seniority is what makes the principal token a credible fixed income instrument rather than a derivative that quietly shares undisclosed risk.

**Pricing the tokens**

A standard constant product AMM prices every trade as moving a flat ratio, with no relationship to time. That's wrong for an instrument converging to a known value. A large trade six days before maturity would move price as much as the same trade six months out.

Novaire's market uses a curve, in the style of Notional Finance, that steepens as maturity nears. Far from expiry, trades move the implied rate meaningfully, reflecting genuine uncertainty. Close to expiry, the same trade barely moves it. The discount at which the principal token trades below face value is the market's implied fixed rate, the same mechanism used to price a zero coupon bond.

There's no separate yield market. Yield exposure is synthesized by splitting a fresh position and selling the principal side into the same curve, so price discovery stays in one place rather than two markets that could drift apart.

**Maturity and shortfall**

At maturity, the protocol freezes the last observed rate and uses it for every subsequent redemption, so nothing earned after expiry leaks into what's owed to principal holders.

Splitting is collateral neutral, but redemption isn't guaranteed to be. If the underlying rate regresses between split and redemption, the escrowed value can fall short of what full redemption requires. Novaire shares that shortfall pro rata across all principal holders rather than paying out first come, first served, an explicit decision about who bears an adverse scenario rather than an assumption that one won't happen.

**Current state**

The implementation is live on Stellar Testnet, wrapping a real Blend v2 pool. Five contracts handle the wrapper, tokenizer, two token types, and the market. The deployment has processed dozens of real deposits, splits, and liquidity additions across funded testnet wallets.

It is not on mainnet and has not been audited. Integration tests currently run against a mocked Blend environment rather than the live pool, so edge cases in Blend's production accounting still need validation. The market contract, which carries the most complex pricing logic, also has the thinnest test coverage relative to its complexity of any component in the system.

**Deliberate scope reduction**

An earlier design included a factory for multiple markets and maturities, a vault layer, a marketplace, automated rollovers, and intent based routing. That was set aside for a smaller system: one position, one maturity, principal and yield separated, priced, and redeemed correctly. This is a scope decision, not a gap. A system whose core function is deciding who bears a shortfall under an adverse rate scenario needs its accounting right before automation gets layered on top.

**Why it matters**

Lending protocols made yield-bearing positions liquid and composable. They didn't make yield itself a priceable instrument, something you could buy today and lock in independent of where the underlying pool's rate goes next month. That requires treating principal and yield as two separate claims from the outset, each with its own holder, its own risk, and its own market.

If the separation holds, it opens a layer beneath a single product: fixed rate positions, yield trading, and treasury strategies that don't depend on guessing where a floating rate goes next. The point isn't that Novaire is the final word on any of that. It's that yield becomes something a market can price on its own — not just a number attached to a position that only ever goes up.
