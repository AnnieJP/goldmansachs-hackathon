% ============================================================
% FOLIO — ASP REBALANCING MODEL v4 (Final)
%
% v2 fixes (Bugs 1-8):
%   Unsatisfiable world state, dead flags, beta × 100, undefined predicates,
%   unified recommend/3 vocabulary, no_sell_path, buy+sell same holding,
%   days_held safe default
%
% v3 fixes (Bugs A-D):
%   Inflation guard on bond increase, Section 11 hard→violation,
%   dead full_liquidate constraint, effective_scenario_loss default
%
% v4 fixes (Bugs E-U):
%   E  — 5 remaining hard constraints converted to conflict flags
%   F  — holding-level recommend/3 added to fact contract
%   G  — violation/1 (under_diversified) → violation/2 (uniform arity)
%   H  — dead bond hard constraint removed
%   I  — wash_sale_risk removed (permanently dead: Section 4 constraint
%        prevents the co-derivation its body requires)
%   J  — Section 0 added: mutual exclusivity for all single-valued facts
%   K  — flag/1 (overtrading, critically_low_balance) → flag/2 (uniform arity)
%   L  — redundant Section 2 conservative bond increase rule removed
%        (fully subsumed by Section 3 rule)
%   M  — duplicate flag(opportunity, financials) removed from Section 2;
%        Section 9 financials_rotation is the canonical rule
%   N  — recession_vs_equity fixed: old rule depended on recommend(increase,
%        stock, type) which requires yield_curve(normal), making it mutually
%        exclusive with recession_signal (yield_curve(inverted)) → never fired
%   O  — rate_hike_signal now actively consumed (Section 2, Section 9)
%   P  — inflation_vs_bonds kept as a catch for Python-supplied type-level recs
%   Q  — return_gap now consumed; was contracted but had no ASP consumer
%   R  — goal_type(preservation) and goal_type(income) now have rules
%   S  — equity_exposure includes etf + fund, not just stock
%   T  — tech_holding predicate introduced; includes ETF type (fixes qqq)
%   U  — violation(buffer_too_low, aggressive) added (5% floor)
% ============================================================


% ────────────────────────────────────────────────────────────
% FACT CONTRACT
% All predicates below must be supplied by Python as ground facts.
%
% Portfolio state:
%   holding(symbol, type, current_pct)       type ∈ {stock,etf,bond,fund,cash}
%   cash_pct(pct)
%   unrealized_pct(symbol, pct)              positive = gain, negative = loss
%   portfolio_beta(beta_x100)                weighted portfolio beta × 100
%   drift(symbol, drift_pct)                 current_pct − target_pct (signed)
%   days_held(symbol, N)                     0 if unknown — short_term rule skips
%   current_shares(symbol, N)               current share count
%   shares_to_sell(symbol, N)               LP-recommended shares to sell
%
% Holding-level recommendations (from Python LP optimizer):
%   recommend(increase, symbol, holding)     buy more of specific holding
%   recommend(reduce, symbol, holding)       sell some of specific holding
%
% Output-only predicates (read from answer set by Python, not consumed in ASP):
%   prefer_sell(H1, H2)   — sell H1 before H2 (H1 at loss, H2 at gain)
%   flag(opportunity, X)  — sector rotation / market signals for UI display
%   flag(review_holding, symbol)     — down >20%, needs human review
%   flag(tax_loss_harvest, symbol)   — loss + bearish = harvesting opportunity
%   flag(short_term_gain_warning, symbol)
%
% Market state (from FRED + yfinance):
%   rate_environment(rising|stable|falling)  SINGLE VALUE — enforced Section 0
%   yield_curve(inverted|flat|normal)        SINGLE VALUE — enforced Section 0
%   vix_level(low|moderate|high)             SINGLE VALUE — enforced Section 0
%   market_trend(bearish|neutral|bullish)    SINGLE VALUE — enforced Section 0
%   inflation_level(low|moderate|high)       SINGLE VALUE — enforced Section 0
%   sector_momentum(sector, positive|negative|neutral)
%   scenario(id)                             SINGLE VALUE — enforced Section 0
%
% Computed by Python math layer:
%   type_total(type, pct)                    sum of holdings of that type
%   scenario_loss_pct(pct)                   optional; defaults to 0 if absent
%   post_rebalance_beta(beta_x100)           estimated beta post-rebalancing
%   post_withdrawal_value(dollars)           estimated value after withdrawal
%   withdrawal_months(N)                     0 = no withdrawal needed
%
% User profile:
%   risk_profile(conservative|moderate|aggressive)  SINGLE VALUE
%   goal_type(growth|preservation|income)
%   return_gap(none|low|medium|high|impossible)
% ────────────────────────────────────────────────────────────


% ════════════════════════════════════════════════════════════
% SECTION 0 — DATA VALIDATION
% Hard constraints here are intentional: supplying contradictory
% single-valued facts is a programming error, not a portfolio state.
% These produce UNSAT deliberately to surface bugs in calling code.
% ════════════════════════════════════════════════════════════

:- risk_profile(conservative), risk_profile(moderate).
:- risk_profile(conservative), risk_profile(aggressive).
:- risk_profile(moderate),     risk_profile(aggressive).

:- yield_curve(inverted), yield_curve(normal).
:- yield_curve(inverted), yield_curve(flat).
:- yield_curve(normal),   yield_curve(flat).

:- market_trend(bullish),  market_trend(bearish).
:- market_trend(bullish),  market_trend(neutral).
:- market_trend(bearish),  market_trend(neutral).

:- rate_environment(rising),  rate_environment(falling).
:- rate_environment(rising),  rate_environment(stable).
:- rate_environment(falling), rate_environment(stable).

:- vix_level(low),      vix_level(high).
:- vix_level(low),      vix_level(moderate).
:- vix_level(moderate), vix_level(high).

:- inflation_level(low),      inflation_level(high).
:- inflation_level(low),      inflation_level(moderate).
:- inflation_level(moderate), inflation_level(high).

:- scenario(X), scenario(Y), X != Y.


% ════════════════════════════════════════════════════════════
% DERIVED FACTS — computed within ASP
% ════════════════════════════════════════════════════════════

% Tech stock classification
tech_stock(aapl). tech_stock(msft). tech_stock(googl). tech_stock(meta).
tech_stock(amzn). tech_stock(nvda). tech_stock(tsla). tech_stock(qqq).

% BUG T FIX: tech_holding includes ETF type (qqq is an ETF, not a stock)
% Previous rule used holding(H, stock, _) which excluded qqq
tech_holding(H) :- tech_stock(H), holding(H, stock, _).
tech_holding(H) :- tech_stock(H), holding(H, etf, _).

% BUG S FIX: equity exposure includes stock + etf + fund, not just stock
% Funds are equity-like in risk and should count toward equity ceilings
equity_type(stock). equity_type(etf). equity_type(fund).
equity_exposure(E) :- E = #sum{ P,T : type_total(T, P), equity_type(T) }.

holding_count(N) :- N = #count{ H : holding(H,_,_) }.

% Total action count: unified across all recommend/3 forms
total_action_count(N) :- N = #count{ A,T,L : recommend(A,T,L) }.

% Gain / loss buckets
at_loss(H)   :- unrealized_pct(H, P), P < 0.
at_gain(H)   :- unrealized_pct(H, P), P > 0.
big_loss(H)  :- unrealized_pct(H, P), P < -20.
stop_loss(H) :- unrealized_pct(H, P), P < -30.

% Short-term only fires when days_held is present and non-zero
short_term(H) :- days_held(H, D), D > 0, D < 365.

% Withdrawal urgency tiers
imminent_withdrawal :- withdrawal_months(M), M > 0, M < 3.
near_withdrawal     :- withdrawal_months(M), M >= 3, M < 12.

% Macro signal shortcuts
recession_signal :- yield_curve(inverted).
rate_hike_signal :- rate_environment(rising).    % BUG O FIX: actively used below

% BUG D FIX: safe default for scenario_loss_pct
% Defaults to 0 if Python does not supply — drawdown rule never silently skips
has_scenario_loss :- scenario_loss_pct(_).
effective_scenario_loss(L) :- scenario_loss_pct(L).
effective_scenario_loss(0) :- not has_scenario_loss.

% Ordering preference for liquidation — output-only, read by Python LP layer
prefer_sell(H1, H2) :-
    at_loss(H1), at_gain(H2),
    holding(H1,_,_), holding(H2,_,_),
    H1 != H2.


% ════════════════════════════════════════════════════════════
% SECTION 1 — POSITION SIZING
% No single bet should blow up the whole portfolio
% ════════════════════════════════════════════════════════════

violation(concentration, H) :-
    holding(H, _, Pct), Pct > 35.

violation(type_concentration, T) :-
    type_total(T, S), S > 60.

% BUG G FIX: unified to arity 2 — violation(under_diversified) was arity 1
violation(under_diversified, portfolio) :-
    holding_count(N), N < 3.


% ════════════════════════════════════════════════════════════
% SECTION 2 — MARKET REGIME RULES
% Don't fight the macro environment
% ════════════════════════════════════════════════════════════

% BUG L FIX: removed redundant conservative bond increase rule that existed here
% It was fully subsumed by the Section 3 rule which covers conservative + moderate
% with the same guards. Only Section 3 now derives recommend(increase, bond, type).

% BUG H FIX: removed dead hard constraint
% :- recommend(increase, bond, type), rate_hike_signal.
% was dead after Bug 1+A fixes added not rate_environment(rising) guards
% to all bond-increase rules. Now uses rate_hike_signal in Section 3 guard only.

% BUG E (VIX constraint) FIX: converted from hard constraint to conflict flag
% Old: :- recommend(increase, stock, type), vix_level(high), type_total(stock,S), S>50.
% World state trigger: yield_curve(normal)+bullish+aggressive+vix_high+stocks>50 → UNSAT
flag(conflict, high_vix_vs_equity) :-
    recommend(increase, stock, type),
    vix_level(high),
    type_total(stock, S), S > 50.

% Crash + high fear: raise cash
recommend(increase, cash, type) :-
    scenario(market_crash), vix_level(high).

% Don't buy into falling tech momentum
% BUG T FIX: uses tech_holding (includes ETFs) instead of holding(H, stock, _)
:- recommend(increase, H, holding),
   tech_holding(H),
   sector_momentum(tech, negative).

% Inflation crushes real bond returns — reduce if overweight
recommend(reduce, bond, type) :-
    inflation_level(high),
    type_total(bond, B), B > 25.

% BUG M FIX: removed flag(opportunity, financials) from here
% Section 9 flag(opportunity, financials_rotation) is the canonical rule
% Both fired under identical conditions — duplicate semantic intent removed


% ════════════════════════════════════════════════════════════
% SECTION 3 — YIELD CURVE INTELLIGENCE
% The yield curve has predicted every US recession since 1955
% ════════════════════════════════════════════════════════════

% Inverted curve: recession ahead — rotate defensive
recommend(reduce, stock, type) :-
    yield_curve(inverted),
    risk_profile(conservative).

% Inverted + rates not rising + inflation not high: bonds are safe haven
% Guards: Bug 1 (not rising), Bug A (not inflation), covers conservative + moderate
recommend(increase, bond, type) :-
    yield_curve(inverted),
    not rate_hike_signal,
    not risk_profile(aggressive),
    not inflation_level(high).

% Flat curve: nobody knows — caution
flag(caution, flat_curve) :- yield_curve(flat).

% Normal curve + bullish + aggressive: go risk-on
recommend(increase, stock, type) :-
    yield_curve(normal),
    market_trend(bullish),
    risk_profile(aggressive).

% Recovery signal after inversion resolves
flag(opportunity, recovery_signal) :-
    yield_curve(normal),
    market_trend(bullish),
    scenario(bull_market).


% ════════════════════════════════════════════════════════════
% SECTION 4 — CONFLICTING SIGNAL DETECTION
% When signals fight each other, sit on your hands
% ════════════════════════════════════════════════════════════

% Crash scenario + growth goal: environment contradicts objective
flag(conflict, crash_vs_growth) :-
    scenario(market_crash), goal_type(growth).

% BUG N FIX: recession_vs_equity old rule required recommend(increase, stock, type)
% which needs yield_curve(normal), but recession_signal needs yield_curve(inverted)
% — mutually exclusive, flag could never fire. Fixed to check portfolio state directly.
flag(conflict, recession_vs_equity) :-
    recession_signal,
    equity_exposure(E), E > 50.

% High inflation + recommending more bonds (bonds lose real value in inflation)
% NOTE: ASP rules for bond increase are guarded by not inflation_level(high),
% so this primarily catches Python-supplied type-level bond increase recommendations
flag(conflict, inflation_vs_bonds) :-
    inflation_level(high),
    recommend(increase, bond, type).

% Unresolvable state: told to raise cash but every sell path is blocked
flag(conflict, no_sell_path) :-
    recommend(increase, cash, type),
    imminent_withdrawal,
    type_total(bond, B), B < 20,
    portfolio_beta(P), P < 60.

% BUG E (cash+stock) FIX: converted from hard constraint to conflict flag
% Old: :- recommend(increase, cash, type), recommend(increase, stock, type), stock>55
% World state trigger: market_crash+vix_high+yield_normal+bullish+aggressive+stocks>55
flag(conflict, cash_vs_equity_posture) :-
    recommend(increase, cash, type),
    recommend(increase, stock, type),
    type_total(stock, S), S > 55.

% BUG Q FIX: return_gap now consumed — was contracted but had no ASP consumer
flag(conflict, goal_impossible) :- return_gap(impossible).
flag(caution, goal_risky)       :- return_gap(high), risk_profile(conservative).

% BUG R FIX: goal_type(income) and goal_type(preservation) now handled
% Income investors rely on dividends; crash destroys dividend-paying stocks
flag(conflict, income_in_crash) :-
    goal_type(income), scenario(market_crash).
% Preservation investors in bull market are being overly conservative
flag(caution, preservation_in_bull) :-
    goal_type(preservation), scenario(bull_market).

% Hard data-integrity constraints — not portfolio logic, programming guards
% If Python simultaneously recommends increase + reduce on the same target, it is a bug
:- recommend(increase, H, holding), recommend(reduce, H, holding).
:- recommend(increase, T, type),    recommend(reduce, T, type).

% Can't grow equity and bonds simultaneously — contradictory postures
:- recommend(increase, stock, type), recommend(increase, bond, type).


% ════════════════════════════════════════════════════════════
% SECTION 5 — DRAWDOWN PROTECTION
% First rule: don't lose money. Second rule: see rule one.
% ════════════════════════════════════════════════════════════

% Output flags — read by Python, not consumed by ASP rules
flag(review_holding, H)  :- big_loss(H).
flag(stop_loss_review, H) :- stop_loss(H).

% BUG E (bond-crash constraint) FIX: converted from hard constraint to conflict flag
% Old: :- recommend(reduce, bond, type), scenario(market_crash), portfolio_beta(B), B<60
% Trigger: inflation_high+bonds>25 fires reduce(bond); crash+beta<60 blocked it → UNSAT
flag(conflict, reduce_bond_in_crash) :-
    recommend(reduce, bond, type),
    scenario(market_crash),
    portfolio_beta(B), B < 60.

% BUG E (scenario_loss constraint) FIX: converted from hard constraint to conflict flag
% Graduated by risk profile: conservative at >15%, moderate at >25%
flag(conflict, scenario_loss_equity_push) :-
    recommend(increase, stock, type),
    effective_scenario_loss(L), L > 15,
    risk_profile(conservative).
flag(conflict, scenario_loss_equity_push) :-
    recommend(increase, stock, type),
    effective_scenario_loss(L), L > 25,
    risk_profile(moderate).


% ════════════════════════════════════════════════════════════
% SECTION 6 — TAX EFFICIENCY
% The best return is the one you don't give to the IRS
% ════════════════════════════════════════════════════════════

% Output flags — read by Python LP layer, not consumed in ASP rules
flag(tax_loss_harvest, H) :-
    at_loss(H), market_trend(bearish).

% Short-term gain warning: only fires when days_held is known and > 0
flag(short_term_gain_warning, H) :-
    short_term(H),
    at_gain(H),
    unrealized_pct(H, P), P > 10,
    recommend(reduce, H, holding).

% BUG I FIX: wash_sale_risk removed — permanently dead
% The Section 4 constraint :- recommend(increase,H,holding), recommend(reduce,H,holding)
% prevents any answer set where both are true for the same H.
% Therefore wash_sale_risk's body (requiring both) can never be satisfied.
% The constraint itself IS the simultaneous buy+sell prevention.
% Note: the IRS 30-day wash sale timing rule requires Python-side handling.


% ════════════════════════════════════════════════════════════
% SECTION 7 — WITHDRAWAL SEQUENCING
% If you need money soon, protect what is stable
% ════════════════════════════════════════════════════════════

% BUG H (dead constraint) FIX: removed dead imminent_withdrawal bond constraint
% Old: :- imminent_withdrawal, recommend(reduce,bond,type), type_total(bond,B), B<20
% Was dead because reduce(bond) requires bonds>25% but constraint required bonds<20%
% These conditions are arithmetically mutually exclusive — can never both hold.
% Replaced with a cleaner flag that catches any bond reduction before withdrawal:
flag(conflict, reduce_bonds_before_withdrawal) :-
    recommend(reduce, bond, type),
    imminent_withdrawal.

% BUG E (near_withdrawal constraint) FIX: converted from hard constraint to conflict flag
% Old: :- near_withdrawal, recommend(increase, stock, type), type_total(stock,S), S>45
% Trigger: yield_normal+bullish+aggressive+withdrawal_in_6mo+stocks>45 → UNSAT
flag(conflict, near_withdrawal_equity_push) :-
    near_withdrawal,
    recommend(increase, stock, type),
    type_total(stock, S), S > 45.

% Full liquidation protection: requires Python to supply shares_to_sell + current_shares
flag(full_liquidation_risk, H) :-
    recommend(reduce, H, holding),
    shares_to_sell(H, N),
    current_shares(H, N).

% BUG K FIX: flag/1 → flag/2 for uniform arity
flag(critically_low_balance, portfolio) :-
    post_withdrawal_value(V), V < 5000.


% ════════════════════════════════════════════════════════════
% SECTION 8 — OVERTRADING PREVENTION
% Every trade costs money — fees, spread, and taxes
% ════════════════════════════════════════════════════════════

% BUG K FIX: flag(overtrading) was arity 1 — unified to arity 2
flag(overtrading, portfolio) :-
    total_action_count(N), N > 4, risk_profile(conservative).
flag(overtrading, portfolio) :-
    total_action_count(N), N > 5, risk_profile(moderate).
flag(overtrading, portfolio) :-
    total_action_count(N), N > 6, risk_profile(aggressive).

% BUG E FIX: drift hard constraints converted to caution flags
% Old: :- recommend(reduce,H,holding), drift(H,D), D>0, D<3  — also was dead (Bug 20)
% Now: surface as caution rather than UNSAT; Python can override if LP justifies it
flag(caution, trivial_drift) :-
    recommend(reduce, H, holding),
    drift(H, D), D > 0, D < 3.
flag(caution, trivial_drift) :-
    recommend(increase, H, holding),
    drift(H, D), D < 0, D > -3.


% ════════════════════════════════════════════════════════════
% SECTION 9 — SECTOR ROTATION
% Different sectors win in different parts of the economic cycle
% ════════════════════════════════════════════════════════════

flag(opportunity, defensive_rotation) :-
    scenario(recession),
    type_total(stock, S), S > 30.

% BUG O FIX: rate_hike_signal now actively consumed here
% BUG M FIX: this is the canonical financials flag; Section 2 duplicate removed
flag(opportunity, financials_rotation) :-
    rate_hike_signal,
    sector_momentum(financials, positive).

flag(opportunity, real_assets) :-
    inflation_level(high),
    market_trend(bearish).

flag(opportunity, growth_stocks) :-
    scenario(bull_market),
    market_trend(bullish),
    yield_curve(normal).


% ════════════════════════════════════════════════════════════
% SECTION 10 — VERDICT
% One clear answer — PROCEED, CAUTION, or STOP
% ════════════════════════════════════════════════════════════

conflict_count(N) :- N = #count{ X : flag(conflict, X) }.

% Soft violations become caution flags (do not hard-block)
% equity_ceiling / beta_ceiling / buffer_too_low are advisory, not blocking
flag(caution, equity_ceiling_breach) :- violation(equity_ceiling, _).
flag(caution, beta_ceiling_breach)   :- violation(beta_ceiling, _).
flag(caution, buffer_too_low_breach) :- violation(buffer_too_low, _).

% Hard stops — do not proceed
verdict(do_not_proceed) :- conflict_count(N), N >= 2.
verdict(do_not_proceed) :- violation(concentration, _).
verdict(do_not_proceed) :- violation(type_concentration, _).
verdict(do_not_proceed) :- violation(under_diversified, _). % BUG G FIX: arity 2
verdict(do_not_proceed) :- flag(critically_low_balance, _). % BUG K FIX: arity 2
verdict(do_not_proceed) :- flag(conflict, no_sell_path).
verdict(do_not_proceed) :- flag(full_liquidation_risk, _).
verdict(do_not_proceed) :- return_gap(impossible).

% Soft warnings — proceed with disclosure
verdict(proceed_with_caution) :-
    conflict_count(N), N = 1,
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    recession_signal,
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    flag(overtrading, _),           % BUG K FIX: arity 2
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    vix_level(high),
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    flag(caution, _),
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    flag(stop_loss_review, _),
    not verdict(do_not_proceed).

% Clean run — all signals aligned
verdict(proceed) :-
    not verdict(do_not_proceed),
    not verdict(proceed_with_caution).


% ════════════════════════════════════════════════════════════
% SECTION 11 — BEGINNER GUARDRAILS
% These feed into verdict — no hard constraints here (Bug B fix)
% All beta values consistently × 100 (Bug 3 fix)
% ════════════════════════════════════════════════════════════

% BUG S FIX: equity_exposure includes stock + etf + fund
% Previous version only checked type_total(stock, S) — equity funds bypassed ceiling
violation(equity_ceiling, conservative) :-
    risk_profile(conservative), equity_exposure(E), E > 40.
violation(equity_ceiling, moderate) :-
    risk_profile(moderate),     equity_exposure(E), E > 60.
violation(equity_ceiling, aggressive) :-
    risk_profile(aggressive),   equity_exposure(E), E > 80.

% Post-rebalance beta ceilings (beta_x100)
violation(beta_ceiling, conservative) :-
    risk_profile(conservative), post_rebalance_beta(B), B > 60.    % 0.60
violation(beta_ceiling, moderate) :-
    risk_profile(moderate),     post_rebalance_beta(B), B > 110.   % 1.10
violation(beta_ceiling, aggressive) :-
    risk_profile(aggressive),   post_rebalance_beta(B), B > 150.   % 1.50

% Minimum stable buffer: bonds + cash floor
violation(buffer_too_low, conservative) :-
    risk_profile(conservative), type_total(bond, B), cash_pct(C), B + C < 30.
violation(buffer_too_low, moderate) :-
    risk_profile(moderate),     type_total(bond, B), cash_pct(C), B + C < 15.
% BUG U FIX: aggressive profile was missing a buffer floor
% Even the most aggressive investor needs 5% liquidity
violation(buffer_too_low, aggressive) :-
    risk_profile(aggressive),   type_total(bond, B), cash_pct(C), B + C < 5.
