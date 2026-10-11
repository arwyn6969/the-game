# Value, investment and fair contribution

Proposed design, 11 October 2026, following Arwyn's question about where value comes from, when it is created or invested, where it goes and who accounts for it. Astra reconsidered its earlier recommendation: defer the generic job system, but include paid, budgeted contributions in the first shared project. These rules are a proposal; they are not implemented.

## What the economy should represent

Useful work, resources, knowledge, tools and cooperation can produce something people benefit from: food, a repair, reliable information, care or time saved. Activity alone is not evidence of value. Paying someone also does not prove the resulting project helped.

Track three things separately: **money moved, agreed work performed, and benefit delivered**. For the library project, payment settles a work agreement; a successful independent lookup demonstrates usefulness. A failed lookup can coexist with fair payment for properly performed work. Neither money nor contribution credit measures a resident's worth.

Creating money and creating useful output are different events. The Bank of England likewise distinguishes money creation from wealth creation in its [money explainer](https://www.bankofengland.co.uk/explainers/how-is-money-created). Our small game need not simulate commercial banking to make that distinction clear.

Investment begins when residents commit existing funds, time or resources to an expected future benefit. Record that commitment and reserve the promised payment before work starts. Expenditure occurs when a transfer settles; usefulness is assessed when people use the result. The result may remain valuable long after the original payment has circulated elsewhere.

## What the reviewed code does

At main code `88f5039ab5743c3b6370a64b2e6d88a7de128da0`:

- `town.ts` seeds 39 coins across six personal purses and 38 in the two shop tills: **77 coins** total. No explicit issuer or opening ledger records this endowment.
- `sim.ts` transfers wages from a till to a worker. Each midnight it also adds up to 12 café coins and 8 grocery coins without a named source. Its absolute caps can reduce an imported till balance above the cap; a cap is not a recorded expense.
- `effects.ts` settles a bread tab into Baba's personal purse, while grocery wages use the separate till. Shop income and payroll therefore do not form an explained business account.
- Balances, debt objects and prose memories provide partial records. There is no comprehensive transaction journal, project budget or ownership record.

These are source observations, not claims about the current hosted build. Resolve them before presenting a complete or fair economy. Preserve existing towns and their balances when introducing the ledger; record a migration opening snapshot, not invented historical earnings.

Focused offline engine probes confirmed the midnight effect: a synthetic town with fresh balances advanced from total money 77 to 97 in that step. A constructed above-cap fixture with 50 in each till advanced from 139 to 111, removing 28. These isolate the existing rules; they do not model a whole played day. No gameplay code changed for this design update.

## A funded first project

Use a grant-funded library index owned in common. The following is one illustrative budget, not a universal wage scale:

| Event                                         | Transfer or allocation                                                          | Result                                                                                                                       |
| --------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Kevin and Baba explicitly approve the project | Café till contributes 4; grocery till contributes 4                             | Project custody holds 8 existing coins; total town money remains 77 in the fresh fixture.                                    |
| Participants accept bounded tasks             | Reserve 2 each for source checking, reference testing and an independent lookup | 6 of the 8 are committed, not paid or created. One resident can perform more than one task, but receives each fee only once. |
| Agreed work is performed                      | Pay the three fees to their actual workers                                      | Workers collectively receive 6; project custody retains 2.                                                                   |
| A correction is needed                        | Offer a separate correction task funded by the remaining 2                      | Corrective work is paid; it is not an unpaid obligation imposed after failure.                                               |
| Project closes without using the reserve      | Return 1 to each contributing till after all liabilities settle                 | No project balance or obligation silently disappears.                                                                        |

Reserve existing payroll and other obligations before approving a contribution. A funded project cannot spend wages already promised elsewhere. Show comparable task scope and completion criteria before acceptance; revise future offers if actual burdens differ. Any necessary coordination or maintenance must also be budgeted or explicitly bounded voluntary work. Declining is allowed without a hidden penalty.

Funders bear the risk that honestly performed work produces an unsuccessful experiment. Pay completed agreed tasks regardless of the later lookup result. Partial completion, cancellation and correction terms are visible in advance. Learning that a method fails can be informative without pretending the index now works.

The index remains accessible to the town. Attribution records who helped; it does not silently award property, voting power or a perpetual share of other people's work. Reinvestment of remaining funds requires a new disclosed decision. No private profit or investor return is implied by this community grant.

## Who keeps the books and who decides

The simulation maintains the authoritative ledger. Each transaction records a stable ID, source, recipient, amount, game time, purpose, agreement and authorization. A transfer debits and credits together or does neither. Repeated requests cannot pay twice. Corrections append an explained reversal or adjustment rather than rewrite history. Model dialogue may explain or propose a transaction, but cannot authorize a player's obligation or alter the books.

Maintain personal purses, business accounts and project funds separately. Route new business income to its business account; classify legacy personal debts honestly instead of silently changing creditors. Track unpaid wages and ordinary debts separately from spendable cash. A debt promise is not newly issued currency.

Start with a recorded endowment and ordinary transfers. Remove unexplained nightly top-ups from the first economy demonstration. If later play needs grants or outside income, give each a named source, authorization and visible amount. The invariant is: **ending total money = opening total + explicit issuance − explicit retirement**. Spending and reserving money do not change that total. A closed demo proves bookkeeping; it does not prove a sustainable long-term economy.

Baba can present the accounts in character, Arwyn can question the supporting records and Kevin can help preserve them. None is the sole authority or an infallible judge. Public projects expose their budgets, terms and expenditure; this does not expose everyone's unrelated personal finances or private memories.

A cooperative approach is a useful starting proposal: voluntary participation, shared oversight and control that money cannot automatically buy. Those principles draw on the [ILO's description of cooperatives](https://www.ilo.org/topics-and-sectors/cooperatives). In the first demo, show explicit funding decisions and rules rather than pretending a complex voting system exists. Fairness also depends on who gets offered work, whose needs get funded and who can contest an error; a balanced ledger alone cannot establish it.

## Acceptance before expanding the economy

1. Follow every coin in the 8-coin example and reconcile the fresh fixture's 77-coin total before/after funding, payment, refund, reload and import. Other initial balances use their own recorded total.
2. Reserve funds once; reject unauthorized, duplicate or unaffordable transfers without partial effects. No balance changes solely because dialogue says someone paid.
3. Pay agreed completed work on both useful and unsuccessful project branches. Preserve outstanding liabilities across midnight and cancellation.
4. Show money spent, tasks completed and actual lookup success separately. Test whether players can explain all three and identify the beneficiary and asset owner.
5. Let people decline, inspect their terms and report a discrepancy. Ensure lower starting wealth does not block access to paid tasks or the common result. Do not turn contribution into a compulsory morality or reputation score.
6. Continue day-5/day-30 economy simulations after the bounded example. Measure concentration, access to work, unpaid obligations and stalled circulation before choosing any future issuance or redistribution rule. Do not claim long-run fairness from this small demonstration.

The first implementation remains trustworthy actions and recovery. The next project packet now includes this minimum accounting contract and paid contributions. General shifts, a broad trading system, loans, new providers and additional residents remain separate work.
