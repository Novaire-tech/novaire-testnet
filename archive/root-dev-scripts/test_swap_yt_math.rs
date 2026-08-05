fn main() {
    let yt_in = 100_000_000i128;
    let min_underlying_out = 0i128;
    let pt_reserves = 0i128;
    let underlying_reserves = 0i128;
    
    // get_spot_price(0, 0, 0)
    let a_pool = 0i128;
    let x = underlying_reserves;
    let y = pt_reserves;
    let num = a_pool.checked_add(y).unwrap();
    let den = a_pool.checked_add(x).unwrap();
    let pt_price = if den == 0 {
        1_000_000_000i128
    } else {
        num.checked_mul(1_000_000_000).unwrap().checked_div(den).unwrap()
    };
    
    let yt_price = 1_000_000_000i128.checked_sub(pt_price).unwrap_or(0);
    
    let underlying_out = yt_in.checked_mul(yt_price).unwrap().checked_div(1_000_000_000).unwrap();
    let actual_underlying_out = underlying_out.checked_mul(995).unwrap().checked_div(1000).unwrap();
    
    println!("pt_price: {}", pt_price);
    println!("yt_price: {}", yt_price);
    println!("actual_underlying_out: {}", actual_underlying_out);
    println!("actual_underlying_out < min_underlying_out: {}", actual_underlying_out < min_underlying_out);
}
