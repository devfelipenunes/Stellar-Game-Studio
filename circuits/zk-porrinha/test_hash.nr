use dep::std;

fn main() {
    // Test basic hashing
    let data = [1, 2, 3, 4];
    let _ = std::hash::poseidon(data);
}
