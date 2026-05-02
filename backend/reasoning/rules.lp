% ============================================================
% FOLIO — ASP REBALANCING MODEL v5 (Best-of-Both)
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
%   I  — wash_sale_risk removed (permanently dead)
%   J  — Section 0: mutual exclusivity for all single-valued facts
%   K  — flag/1 → flag/2 uniform arity
%   L  — redundant Section 2 bond increase rule removed
%   M  — duplicate financials flag removed from Section 2
%   N  — recession_vs_equity fixed (was mutually exclusive, never fired)
%   O  — rate_hike_signal actively consumed
%   P  — inflation_vs_bonds catches Python-supplied recs
%   Q  — return_gap now consumed
%   R  — goal_type(preservation) and goal_type(income) handled
%   S  — equity_exposure includes etf + fund
%   T  — tech_holding includes ETF type (fixes qqq)
%   U  — violation(buffer_too_low, aggressive) added
%
% v5 changes (Best-of-Both):
%   V  — sector_of/2 support: generic sector-momentum constraint replaces
%        hardcoded tech-only rule; hardcoded list kept as graceful fallback
%        for holdings without sector_of supplied. No hard constraint on
%        sector_of presence — missing sector data surfaces as caution flag.
%   W  — equity_type hardcoded in .lp as default; Python may extend with
%        additional equity_type/1 facts for exotic instruments.
%   X  — Parameterized thresholds via config/2-3 with .lp-level defaults.
%        Python can override any threshold without touching rules.lp.
%   Y  — Overtrading limits scale with portfolio size: base + floor(N/5)
%        extra actions per risk tier, fairer for large portfolios.
%   Z  — Enhanced prefer_sell/2 tie-breakers: bigger loss first (tax
%        benefit), bigger gain first (realize winners), short-term before
%        long-term (avoid future tax cliffs).
%  Z1  — verdict(proceed) now requires holding_count > 0 (empty portfolios
%        no longer produce a false clean-run signal).
%  Z2  — Sector rotation opportunity flags enhanced: sector_rotation/1
%        fires for any sector with positive momentum that we hold.
% ============================================================


% ────────────────────────────────────────────────────────────
% FACT CONTRACT
%
% REQUIRED from Python:
%   holding(symbol, type, current_pct)       type ∈ {stock,etf,bond,fund,cash}
%   cash_pct(pct)
%   unrealized_pct(symbol, pct)              positive = gain, negative = loss
%   portfolio_beta(beta_x100)                weighted portfolio beta × 100
%   drift(symbol, drift_pct)                 current_pct − target_pct (signed)
%   days_held(symbol, N)                     0 if unknown
%   current_shares(symbol, N)
%   shares_to_sell(symbol, N)
%   recommend(increase|reduce, symbol, holding)
%   rate_environment(rising|stable|falling)  SINGLE VALUE
%   yield_curve(inverted|flat|normal)        SINGLE VALUE
%   vix_level(low|moderate|high)             SINGLE VALUE
%   market_trend(bearish|neutral|bullish)    SINGLE VALUE
%   inflation_level(low|moderate|high)       SINGLE VALUE
%   sector_momentum(sector, positive|negative|neutral)
%   scenario(id)                             SINGLE VALUE
%   type_total(type, pct)
%   scenario_loss_pct(pct)                   optional — defaults to 0
%   post_rebalance_beta(beta_x100)
%   post_withdrawal_value(dollars)
%   withdrawal_months(N)
%   risk_profile(conservative|moderate|aggressive)  SINGLE VALUE
%   goal_type(growth|preservation|income)
%   return_gap(none|low|medium|high|impossible)
%
% OPTIONAL enrichment from Python (v5):
%   sector_of(symbol, sector)   tech|financials|healthcare|energy|...
%                               If supplied, enables generic sector-momentum
%                               constraint for that holding. Missing = caution.
%   equity_type(type)           Python may add reit, mlp, etc. beyond defaults.
%   config(key, value)          Override any threshold (see CONFIG DEFAULTS).
%   config(key, profile, value) Override profile-specific threshold.
%
% OUTPUT read by Python (not consumed in ASP):
%   prefer_sell(H1, H2)
%   flag(category, detail)
%   violation(category, detail)
%   verdict(proceed|proceed_with_caution|do_not_proceed)
% ────────────────────────────────────────────────────────────


% ════════════════════════════════════════════════════════════
% SECTION 0 — DATA VALIDATION
% Hard constraints catch contradictory single-valued facts (programming errors).
% Missing sector data is a soft warning, not UNSAT.
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

% Soft warning — not UNSAT: surfaces missing sector data without crashing
flag(caution, missing_sector_data) :-
    holding(H, T, _), T != cash, not sector_of(H, _),
    not tech_stock(H).   % suppress: tech fallback covers these already


% ════════════════════════════════════════════════════════════
% CONFIG DEFAULTS (v5 — parameterized thresholds)
% Python can supply config/2 or config/3 facts to override any value.
% .lp defaults ensure the model is self-contained without Python config.
% ════════════════════════════════════════════════════════════

effective_equity_ceiling(conservative, 40) :- not config(equity_ceiling, conservative, _).
effective_equity_ceiling(moderate,     60) :- not config(equity_ceiling, moderate,     _).
effective_equity_ceiling(aggressive,   80) :- not config(equity_ceiling, aggressive,   _).
effective_equity_ceiling(P, X) :- config(equity_ceiling, P, X).

effective_beta_ceiling(conservative,  60) :- not config(beta_ceiling, conservative, _).
effective_beta_ceiling(moderate,     110) :- not config(beta_ceiling, moderate,     _).
effective_beta_ceiling(aggressive,   150) :- not config(beta_ceiling, aggressive,   _).
effective_beta_ceiling(P, X) :- config(beta_ceiling, P, X).

effective_buffer_floor(conservative, 30) :- not config(buffer_floor, conservative, _).
effective_buffer_floor(moderate,     15) :- not config(buffer_floor, moderate,     _).
effective_buffer_floor(aggressive,    5) :- not config(buffer_floor, aggressive,   _).
effective_buffer_floor(P, X) :- config(buffer_floor, P, X).

effective_concentration_limit(holding, 35) :- not config(concentration_limit, holding, _).
effective_concentration_limit(type,    60) :- not config(concentration_limit, type,    _).
effective_concentration_limit(K, X) :- config(concentration_limit, K, X).

effective_big_loss_threshold(-20) :- not config(big_loss_threshold, _).
effective_big_loss_threshold(X)   :- config(big_loss_threshold, X).

effective_stop_loss_threshold(-30) :- not config(stop_loss_threshold, _).
effective_stop_loss_threshold(X)   :- config(stop_loss_threshold, X).

effective_short_term_days(365) :- not config(short_term_days, _).
effective_short_term_days(X)   :- config(short_term_days, X).

effective_drift_threshold(3) :- not config(trivial_drift_threshold, _).
effective_drift_threshold(X) :- config(trivial_drift_threshold, X).


% ════════════════════════════════════════════════════════════
% DERIVED FACTS — STRATIFICATION LAYER 1
% Computed from base facts; consumed by rules in later strata.
% ════════════════════════════════════════════════════════════

% ── Tech stock classification (v4 hardcoded list, kept as fallback) ──────────
% Active for holdings where Python has NOT supplied sector_of.
% When Python supplies sector_of(H, tech), the generic Section 2 rule fires
% instead and these predicates become redundant but harmless.
tech_stock(aapl). tech_stock(msft). tech_stock(googl). tech_stock(meta).
tech_stock(amzn). tech_stock(nvda). tech_stock(tsla).  tech_stock(qqq).

tech_holding(H) :- tech_stock(H), holding(H, stock, _).
tech_holding(H) :- tech_stock(H), holding(H, etf,   _).

% ── Equity type classification ───────────────────────────────────────────────
% Hardcoded defaults; Python may add equity_type(reit). equity_type(mlp). etc.
equity_type(stock). equity_type(etf). equity_type(fund).

% ── Equity exposure: sum all equity-type holdings ───────────────────────────
equity_exposure(E) :- E = #sum{ P,T : type_total(T, P), equity_type(T) }.
equity_exposure(0) :- not equity_type(_).

% ── Sector membership (v5 — generic, from Python-supplied sector_of/2) ───────
sector_holding(Sector, H) :- holding(H, _, _), sector_of(H, Sector).

% ── Portfolio metrics ────────────────────────────────────────────────────────
holding_count(N)       :- N = #count{ H : holding(H,_,_) }.
total_action_count(N)  :- N = #count{ A,T,L : recommend(A,T,L) }.

% ── Gain / loss classification (parameterized thresholds) ───────────────────
at_loss(H)   :- unrealized_pct(H, P), P < 0.
at_gain(H)   :- unrealized_pct(H, P), P > 0.

big_loss(H)  :- unrealized_pct(H, P), effective_big_loss_threshold(T),  P < T.
stop_loss(H) :- unrealized_pct(H, P), effective_stop_loss_threshold(T), P < T.

loss_magnitude(H, M) :- unrealized_pct(H, P), P < 0, M = -P.
loss_magnitude(H, 0) :- unrealized_pct(H, P), P >= 0.

% ── Short-term holding (parameterized period) ────────────────────────────────
short_term(H) :-
    days_held(H, D), D > 0,
    effective_short_term_days(Limit),
    D < Limit.

% ── Withdrawal urgency tiers ─────────────────────────────────────────────────
imminent_withdrawal :- withdrawal_months(M), M > 0, M < 3.
near_withdrawal     :- withdrawal_months(M), M >= 3, M < 12.

% ── Macro signal shortcuts ───────────────────────────────────────────────────
recession_signal :- yield_curve(inverted).
rate_hike_signal :- rate_environment(rising).

% ── Scenario loss safe default ───────────────────────────────────────────────
has_scenario_loss :- scenario_loss_pct(_).
effective_scenario_loss(L) :- scenario_loss_pct(L).
effective_scenario_loss(0) :- not has_scenario_loss.


% ════════════════════════════════════════════════════════════
% LIQUIDATION PREFERENCE — STRATIFICATION LAYER 2
% Output-only; read by Python LP layer, not consumed in ASP rules.
% v5: enhanced tie-breakers for fairer liquidation ordering.
% ════════════════════════════════════════════════════════════

% Primary: sell losses before gains (tax harvesting)
prefer_sell(H1, H2) :-
    at_loss(H1), at_gain(H2),
    holding(H1,_,_), holding(H2,_,_),
    H1 != H2.

% Tie-breaker 1: among losses, prefer bigger loss first (maximum tax benefit)
prefer_sell(H1, H2) :-
    at_loss(H1), at_loss(H2),
    loss_magnitude(H1, M1), loss_magnitude(H2, M2),
    M1 > M2, H1 != H2.

% Tie-breaker 2: among gains, prefer bigger gain first (realize winners)
prefer_sell(H1, H2) :-
    at_gain(H1), at_gain(H2),
    unrealized_pct(H1, G1), unrealized_pct(H2, G2),
    G1 > G2, H1 != H2.

% Tie-breaker 3: prefer short-term over long-term (avoid future tax cliff)
prefer_sell(H1, H2) :-
    short_term(H1), not short_term(H2),
    holding(H1,_,_), holding(H2,_,_),
    H1 != H2.


% ════════════════════════════════════════════════════════════
% SECTION 1 — POSITION SIZING
% No single bet should blow up the whole portfolio.
% Thresholds now use parameterized config values.
% ════════════════════════════════════════════════════════════

violation(concentration, H) :-
    holding(H, _, Pct),
    effective_concentration_limit(holding, Limit),
    Pct > Limit.

violation(type_concentration, T) :-
    type_total(T, S),
    effective_concentration_limit(type, Limit),
    S > Limit.

violation(under_diversified, portfolio) :-
    holding_count(N), N < 3.


% ════════════════════════════════════════════════════════════
% SECTION 2 — MARKET REGIME RULES
% Don't fight the macro environment.
% v5: generic sector-momentum constraint; tech fallback preserved.
% ════════════════════════════════════════════════════════════

flag(conflict, high_vix_vs_equity) :-
    recommend(increase, stock, type),
    vix_level(high),
    type_total(stock, S), S > 50.

% Crash + high fear: raise cash
recommend(increase, cash, type) :-
    scenario(market_crash), vix_level(high).

% v5 GENERIC RULE: don't buy into any sector with falling momentum
% Fires when Python has supplied sector_of(H, Sector) for the holding
:- recommend(increase, H, holding),
   sector_of(H, Sector),
   sector_momentum(Sector, negative).

% v4 FALLBACK RULE: hardcoded tech tickers without sector_of supplied
% Suppressed for holdings that already have sector_of (avoids double-firing)
:- recommend(increase, H, holding),
   tech_holding(H),
   not sector_of(H, _),
   sector_momentum(tech, negative).

% Inflation crushes real bond returns — reduce if overweight
recommend(reduce, bond, type) :-
    inflation_level(high),
    type_total(bond, B), B > 25.


% ════════════════════════════════════════════════════════════
% SECTION 3 — YIELD CURVE INTELLIGENCE
% The yield curve has predicted every US recession since 1955.
% ════════════════════════════════════════════════════════════

recommend(reduce, stock, type) :-
    yield_curve(inverted),
    risk_profile(conservative).

recommend(increase, bond, type) :-
    yield_curve(inverted),
    not rate_hike_signal,
    not risk_profile(aggressive),
    not inflation_level(high).

flag(caution, flat_curve) :- yield_curve(flat).

recommend(increase, stock, type) :-
    yield_curve(normal),
    market_trend(bullish),
    risk_profile(aggressive).

flag(opportunity, recovery_signal) :-
    yield_curve(normal),
    market_trend(bullish),
    scenario(bull_market).


% ════════════════════════════════════════════════════════════
% SECTION 4 — CONFLICTING SIGNAL DETECTION
% When signals fight each other, sit on your hands.
% ════════════════════════════════════════════════════════════

flag(conflict, crash_vs_growth) :-
    scenario(market_crash), goal_type(growth).

flag(conflict, recession_vs_equity) :-
    recession_signal,
    equity_exposure(E), E > 50.

flag(conflict, inflation_vs_bonds) :-
    inflation_level(high),
    recommend(increase, bond, type).

flag(conflict, no_sell_path) :-
    recommend(increase, cash, type),
    imminent_withdrawal,
    type_total(bond, B), B < 20,
    portfolio_beta(P), P < 60.

flag(conflict, cash_vs_equity_posture) :-
    recommend(increase, cash, type),
    recommend(increase, stock, type),
    type_total(stock, S), S > 55.

flag(conflict, goal_impossible) :- return_gap(impossible).
flag(caution,  goal_risky)      :- return_gap(high), risk_profile(conservative).

flag(conflict, income_in_crash) :-
    goal_type(income), scenario(market_crash).
flag(caution, preservation_in_bull) :-
    goal_type(preservation), scenario(bull_market).

% Data-integrity constraints (programming guards, not portfolio logic)
:- recommend(increase, H, holding), recommend(reduce, H, holding).
:- recommend(increase, T, type),    recommend(reduce, T, type).
:- recommend(increase, stock, type), recommend(increase, bond, type).


% ════════════════════════════════════════════════════════════
% SECTION 5 — DRAWDOWN PROTECTION
% First rule: don't lose money. Second rule: see rule one.
% ════════════════════════════════════════════════════════════

flag(review_holding,  H) :- big_loss(H).
flag(stop_loss_review, H) :- stop_loss(H).

flag(conflict, reduce_bond_in_crash) :-
    recommend(reduce, bond, type),
    scenario(market_crash),
    portfolio_beta(B), B < 60.

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
% The best return is the one you don't give to the IRS.
% ════════════════════════════════════════════════════════════

flag(tax_loss_harvest, H) :-
    at_loss(H), market_trend(bearish).

flag(short_term_gain_warning, H) :-
    short_term(H),
    at_gain(H),
    unrealized_pct(H, P), P > 10,
    recommend(reduce, H, holding).


% ════════════════════════════════════════════════════════════
% SECTION 7 — WITHDRAWAL SEQUENCING
% If you need money soon, protect what is stable.
% ════════════════════════════════════════════════════════════

flag(conflict, reduce_bonds_before_withdrawal) :-
    recommend(reduce, bond, type),
    imminent_withdrawal.

flag(conflict, near_withdrawal_equity_push) :-
    near_withdrawal,
    recommend(increase, stock, type),
    type_total(stock, S), S > 45.

flag(full_liquidation_risk, H) :-
    recommend(reduce, H, holding),
    shares_to_sell(H, N),
    current_shares(H, N).

flag(critically_low_balance, portfolio) :-
    post_withdrawal_value(V), V < 5000.


% ════════════════════════════════════════════════════════════
% SECTION 8 — OVERTRADING PREVENTION
% v5: limits scale with portfolio size — base + floor(holdings / 5)
% Every trade costs money: fees, spread, and taxes.
% ════════════════════════════════════════════════════════════

flag(overtrading, portfolio) :-
    total_action_count(A),
    holding_count(H),
    Limit = 4 + H / 5,
    A > Limit,
    risk_profile(conservative).

flag(overtrading, portfolio) :-
    total_action_count(A),
    holding_count(H),
    Limit = 5 + H / 5,
    A > Limit,
    risk_profile(moderate).

flag(overtrading, portfolio) :-
    total_action_count(A),
    holding_count(H),
    Limit = 6 + H / 5,
    A > Limit,
    risk_profile(aggressive).

% Drift warnings use configurable threshold
flag(caution, trivial_drift) :-
    recommend(reduce, H, holding),
    drift(H, D), D > 0,
    effective_drift_threshold(T), D < T.
flag(caution, trivial_drift) :-
    recommend(increase, H, holding),
    drift(H, D), D < 0,
    effective_drift_threshold(T), D > -T.


% ════════════════════════════════════════════════════════════
% SECTION 9 — SECTOR ROTATION
% Different sectors win in different parts of the economic cycle.
% v5: generic sector_rotation/1 for any sector we hold with positive momentum.
% ════════════════════════════════════════════════════════════

flag(opportunity, defensive_rotation) :-
    scenario(recession),
    type_total(stock, S), S > 30.

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

% v5 GENERIC: sector rotation signal for any held sector with tailwind
% Only fires when Python has supplied sector_of for at least one holding
flag(opportunity, sector_rotation(Sector)) :-
    sector_momentum(Sector, positive),
    market_trend(bullish),
    sector_holding(Sector, _).


% ════════════════════════════════════════════════════════════
% SECTION 10 — VERDICT
% One clear answer: PROCEED, CAUTION, or STOP.
% v5: verdict(proceed) requires a non-empty portfolio.
% ════════════════════════════════════════════════════════════

conflict_count(N) :- N = #count{ X : flag(conflict, X) }.

flag(caution, equity_ceiling_breach) :- violation(equity_ceiling, _).
flag(caution, beta_ceiling_breach)   :- violation(beta_ceiling, _).
flag(caution, buffer_too_low_breach) :- violation(buffer_too_low, _).

verdict(do_not_proceed) :- conflict_count(N), N >= 2.
verdict(do_not_proceed) :- violation(concentration, _).
verdict(do_not_proceed) :- violation(type_concentration, _).
verdict(do_not_proceed) :- violation(under_diversified, _).
verdict(do_not_proceed) :- flag(critically_low_balance, _).
verdict(do_not_proceed) :- flag(conflict, no_sell_path).
verdict(do_not_proceed) :- flag(full_liquidation_risk, _).
verdict(do_not_proceed) :- return_gap(impossible).

verdict(proceed_with_caution) :-
    conflict_count(N), N = 1,
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    recession_signal,
    not verdict(do_not_proceed).
verdict(proceed_with_caution) :-
    flag(overtrading, _),
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

% v5 FIX: require a non-empty portfolio — empty state no longer returns false proceed
verdict(proceed) :-
    holding_count(N), N > 0,
    not verdict(do_not_proceed),
    not verdict(proceed_with_caution).


% ════════════════════════════════════════════════════════════
% SECTION 11 — RISK GUARDRAILS
% Parameterized ceilings (v5); no hard constraints — all feed into verdict.
% ════════════════════════════════════════════════════════════

violation(equity_ceiling, P) :-
    risk_profile(P),
    effective_equity_ceiling(P, Limit),
    equity_exposure(E), E > Limit.

violation(beta_ceiling, P) :-
    risk_profile(P),
    effective_beta_ceiling(P, Limit),
    post_rebalance_beta(B), B > Limit.

violation(buffer_too_low, P) :-
    risk_profile(P),
    effective_buffer_floor(P, Floor),
    type_total(bond, B), cash_pct(C),
    B + C < Floor.
